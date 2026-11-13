import "server-only"
import { and, asc, desc, eq, notInArray, or, sql, type SQL } from "drizzle-orm"
import { db, schema } from "@/db/client"
import type { ChordSource } from "@/lib/schemas/transcriber"

/**
 * Tabs d'acords d'internet de cada cançó (taula song_chord_sources, fonts/ del transcriptor).
 *
 * Les files que troba el worker es reescriuen amb cada anàlisi (`saveChordSources`). `manual` i
 * `blocked` només els toca l'admin: una font manual o descartada es conserva encara que l'última
 * anàlisi no la faci servir, i viatja a la feina en fer `claim` (`chordSourcesForClaim`).
 */

const NOW = sql`datetime('now')`
const T = schema.songChordSources

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Db = typeof db | Tx

/**
 * Desa les fonts de l'anàlisi nova de la cançó (dins la transacció que desa l'anàlisi). La «bd»
 * (el content de la mateixa cançó) no es desa. Les que ja hi eren s'actualitzen sense tocar
 * `manual` ni `blocked`; les que ja no surten s'esborren, tret de les manuals i les descartades,
 * que es queden sense pes. Sense `chord_sources` (worker antic o cap tab trobada) és com una
 * llista buida.
 */
export function saveChordSources(tx: Db, songId: number, sources: ChordSource[] | undefined): void {
  const byUrl = new Map<string, ChordSource>()
  for (const s of sources ?? []) {
    if (s.site !== "bd" && s.url && !byUrl.has(s.url)) byUrl.set(s.url, s)
  }
  for (const s of byUrl.values()) {
    const fields = {
      site: s.site,
      rating: s.rating,
      votes: s.votes,
      fit: s.fit,
      matched: s.matched,
      weight: s.weight,
      groupId: s.group,
      used: s.used ? 1 : 0,
      updatedAt: NOW,
    }
    // Una fila nova no és manual encara que el worker ho digui: l'admin l'hauria tret mentre
    // la feina corria (si no, ja hi seria)
    tx.insert(T)
      .values({ songId, url: s.url, ...fields })
      .onConflictDoUpdate({ target: [T.songId, T.url], set: fields })
      .run()
  }

  const urls = [...byUrl.keys()]
  const gone = (extra: SQL | undefined) =>
    and(eq(T.songId, songId), urls.length > 0 ? notInArray(T.url, urls) : undefined, extra)
  tx.delete(T)
    .where(gone(and(eq(T.manual, 0), eq(T.blocked, 0))))
    .run()
  tx.update(T)
    .set({ used: 0, weight: 0, updatedAt: NOW })
    .where(gone(or(eq(T.manual, 1), eq(T.blocked, 1))))
    .run()
}

/** URL per a la feina: les afegides a mà (sense les descartades) i les descartades. */
export function chordSourcesForClaim(tx: Db, songId: number): { urls: string[]; blocked: string[] } {
  const rows = tx
    .select({ url: T.url, manual: T.manual, blocked: T.blocked })
    .from(T)
    .where(and(eq(T.songId, songId), or(eq(T.manual, 1), eq(T.blocked, 1))))
    .orderBy(asc(T.url))
    .all()
  return {
    urls: rows.filter((r) => r.manual === 1 && r.blocked === 0).map((r) => r.url),
    blocked: rows.filter((r) => r.blocked === 1).map((r) => r.url),
  }
}

// ─── Admin ──────────────────────────────────────────────────

export interface ChordSourceRow {
  url: string
  site: string
  manual: boolean
  blocked: boolean
  rating: number | null
  votes: number | null
  fit: number | null
  matched: number | null
  weight: number
  group: number | null
  used: boolean
  created_at: string | null
  updated_at: string | null
}

/** Fonts de la cançó: les fetes servir i amb més pes primer. */
export function listChordSources(songId: number): ChordSourceRow[] {
  return db
    .select()
    .from(T)
    .where(eq(T.songId, songId))
    .orderBy(desc(T.used), desc(T.weight), asc(T.site), asc(T.url))
    .all()
    .map((r) => ({
      url: r.url,
      site: r.site,
      manual: r.manual === 1,
      blocked: r.blocked === 1,
      rating: r.rating,
      votes: r.votes,
      fit: r.fit,
      matched: r.matched,
      weight: r.weight,
      group: r.groupId,
      used: r.used === 1,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }))
}

/** Afegeix una URL a mà. Si ja hi era (trobada pel worker o descartada), passa a manual i no descartada. */
export function addManualChordSource(songId: number, url: string, site: string): void {
  db.insert(T)
    .values({ songId, url, site, manual: 1, blocked: 0 })
    .onConflictDoUpdate({ target: [T.songId, T.url], set: { manual: 1, blocked: 0, updatedAt: NOW } })
    .run()
}

/** Descarta (o recupera) una font de la cançó. false si no existeix. */
export function setChordSourceBlocked(songId: number, url: string, blocked: boolean): boolean {
  const r = db
    .update(T)
    .set({ blocked: blocked ? 1 : 0, updatedAt: NOW })
    .where(and(eq(T.songId, songId), eq(T.url, url)))
    .run()
  return r.changes > 0
}

/**
 * Treu una font afegida a mà. Si està descartada, només deixa de ser manual (el descart es
 * manté). false si no existeix o no és manual. Si el worker també la troba pel seu compte, la
 * propera anàlisi la tornarà a afegir com a automàtica.
 */
export function removeManualChordSource(songId: number, url: string): boolean {
  const where = and(eq(T.songId, songId), eq(T.url, url), eq(T.manual, 1))
  const unmarked = db.update(T).set({ manual: 0, updatedAt: NOW }).where(and(where, eq(T.blocked, 1))).run()
  if (unmarked.changes > 0) return true
  return db.delete(T).where(where).run().changes > 0
}
