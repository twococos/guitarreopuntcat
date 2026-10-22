import { eq, like, or, asc, desc, and, sql, isNotNull, count, ne } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { mapSong, mapSongListItem, mapSongSummary } from "./utils"
import { slugify, resolveCollision } from "@/lib/slugify"
import type { SongQuery } from "@/lib/schemas/song"
import { songListCondition, type Viewer } from "@/lib/access/songs"
import { SONG_STATE } from "@/lib/songKind"

// Slugs d'artista que no es poden fer servir: són rutes sota /songs.
const RESERVED_ARTIST_SLUGS = ["private"]

// Camps que disparen actualització de updated_at en fer updateSong.
// `state` no està a la llista: només volem traçar canvis de contingut.
const SONG_CONTENT_KEYS = [
  "title", "artist", "key", "capo", "content", "language", "tags",
  "album", "year", "youtubeUrl", "spotifyUrl", "bpm", "timeSignature",
] as const

// ─── GET /api/songs ──────────────────────────────────────────

/** Llista de /app: públiques + les pròpies de l'usuari (amb el tipus). */
export async function listSongs(query: SongQuery, viewer: Viewer) {
  const { search, artist, sortBy, order } = query

  const conditions = [songListCondition(viewer)]

  if (search) {
    conditions.push(
      or(
        like(schema.songs.title, `%${search}%`),
        like(schema.songs.artist, `%${search}%`),
      )!,
    )
  }

  if (artist) {
    conditions.push(like(schema.songs.artist, `%${artist}%`))
  }

  const col = (() => {
    switch (sortBy) {
      case "artist":
        return schema.songs.artist
      case "key":
        return schema.songs.key
      case "created_at":
        return schema.songs.createdAt
      default:
        return schema.songs.title
    }
  })()

  const orderExpr = order === "DESC" ? desc(col) : asc(col)

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
      state: schema.songs.state,
      ownerId: schema.songs.ownerId,
      originalSongId: schema.songs.originalSongId,
    })
    .from(schema.songs)
    .where(and(...conditions))
    .orderBy(orderExpr)

  return rows.map(mapSongListItem)
}

// ─── GET /api/songs/[id] ─────────────────────────────────────

export async function getSongById(id: number) {
  const [song] = await db
    .select()
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .limit(1)

  if (!song) return null
  return mapSong(song)
}

// ─── Slugs ───────────────────────────────────────────────────

function normalizeArtistKey(artist: string): string {
  return artist
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * Calcula `artist_slug` i `song_slug` per a una cançó nova. Reutilitza
 * l'`artist_slug` existent si ja hi ha cançons del mateix artista (clau
 * normalitzada); en cas contrari en genera un de nou i resol col·lisions
 * globals. Per `song_slug`, resol col·lisions dins l'artista.
 *
 * Exportat perquè `createProposal` també l'utilitza.
 */
export function generateSlugsForNewSong(
  artist: string,
  title: string,
): { artistSlug: string; songSlug: string } {
  const artistKey = normalizeArtistKey(artist)

  const existing = db
    .select({ artist: schema.songs.artist, artistSlug: schema.songs.artistSlug })
    .from(schema.songs)
    .where(isNotNull(schema.songs.artistSlug))
    .all()

  let artistSlug: string | undefined
  const usedArtistSlugs = new Set<string>(RESERVED_ARTIST_SLUGS)
  for (const row of existing) {
    if (row.artistSlug) {
      usedArtistSlugs.add(row.artistSlug)
      if (!artistSlug && normalizeArtistKey(row.artist) === artistKey) {
        artistSlug = row.artistSlug
      }
    }
  }

  if (!artistSlug) {
    artistSlug = resolveCollision(slugify(artist), usedArtistSlugs)
  }

  const sameArtistSongs = db
    .select({ songSlug: schema.songs.songSlug })
    .from(schema.songs)
    .where(eq(schema.songs.artistSlug, artistSlug))
    .all()
  const usedSongSlugs = new Set<string>()
  for (const row of sameArtistSongs) {
    if (row.songSlug) usedSongSlugs.add(row.songSlug)
  }

  const songSlug = resolveCollision(slugify(title), usedSongSlugs)
  return { artistSlug, songSlug }
}

/**
 * Slugs que cal posar a una cançó que es publica, o null si ja en té.
 * Les privades i les propostes es creen sense slug perquè un arranjament no
 * ocupi el nom de la pública (que acabaria sent "-2"). Es calcula FORA de la
 * transacció, com a la creació.
 */
export function slugsForPublishing(songId: number): { artistSlug: string; songSlug: string } | null {
  const song = db
    .select({
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
    })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId))
    .get()
  if (!song || (song.artistSlug && song.songSlug)) return null
  return generateSlugsForNewSong(song.artist, song.title)
}

// ─── POST /api/songs ─────────────────────────────────────────

export interface SongData {
  title: string
  artist: string
  key: string
  capo: number
  content: string
  language: string
  tags: string
  album?: string | null
  year?: number | null
  youtubeUrl?: string | null
  spotifyUrl?: string | null
  bpm?: number | null
  timeSignature?: string | null
}

/**
 * Crea una cançó. Pública (admin) amb slugs; privada (o arranjament si porta
 * `originalSongId`) sense slugs i amb propietari.
 */
export async function createSong(
  data: SongData,
  opts: { state: typeof SONG_STATE.PUBLIC } | {
    state: typeof SONG_STATE.PRIVATE
    ownerId: number
    originalSongId?: number | null
  },
) {
  const slugs =
    opts.state === SONG_STATE.PUBLIC
      ? generateSlugsForNewSong(data.artist, data.title)
      : { artistSlug: null, songSlug: null }

  const result = db
    .insert(schema.songs)
    .values({
      title: data.title,
      artist: data.artist,
      artistSlug: slugs.artistSlug,
      songSlug: slugs.songSlug,
      key: data.key,
      capo: data.capo,
      content: data.content,
      language: data.language,
      tags: data.tags,
      album: data.album ?? null,
      year: data.year ?? null,
      youtubeUrl: data.youtubeUrl ?? null,
      spotifyUrl: data.spotifyUrl ?? null,
      bpm: data.bpm ?? null,
      timeSignature: data.timeSignature ?? null,
      state: opts.state,
      ownerId: opts.state === SONG_STATE.PRIVATE ? opts.ownerId : null,
      originalSongId: opts.state === SONG_STATE.PRIVATE ? (opts.originalSongId ?? null) : null,
    })
    .run()

  return { id: Number(result.lastInsertRowid) }
}

/** Una cançó és vàlida com a original d'un arranjament si és pública. */
export function isValidOriginal(originalId: number, songId?: number): boolean {
  if (songId !== undefined && originalId === songId) return false
  const row = db
    .select({ state: schema.songs.state })
    .from(schema.songs)
    .where(eq(schema.songs.id, originalId))
    .get()
  return row?.state === SONG_STATE.PUBLIC
}

// ─── Canvis de tipus (admin, PATCH /api/admin/songs/[id]) ─────

export type SongKindChange =
  | { kind: "public" }
  | { kind: "private"; ownerId: number }
  | { kind: "arrangement"; ownerId: number; originalSongId: number }

/**
 * Aplica un canvi de tipus. Pública → sense propietari ni original (i amb
 * slugs). Privada/arranjament → amb propietari. Les propostes pendents no es
 * toquen aquí: passen per la revisió de propostes.
 */
export function changeSongKind(songId: number, change: SongKindChange) {
  const slugs = change.kind === "public" ? slugsForPublishing(songId) : null
  const result = db
    .update(schema.songs)
    .set(
      change.kind === "public"
        ? { state: SONG_STATE.PUBLIC, ownerId: null, originalSongId: null, ...(slugs ?? {}) }
        : {
            state: SONG_STATE.PRIVATE,
            ownerId: change.ownerId,
            originalSongId: change.kind === "arrangement" ? change.originalSongId : null,
          },
    )
    .where(and(eq(schema.songs.id, songId), ne(schema.songs.state, SONG_STATE.PENDING)))
    .run()
  return { changes: result.changes }
}

/** Canvia el propietari d'una privada o arranjament. */
export function changeSongOwner(songId: number, ownerId: number) {
  const result = db
    .update(schema.songs)
    .set({ ownerId })
    .where(and(eq(schema.songs.id, songId), eq(schema.songs.state, SONG_STATE.PRIVATE)))
    .run()
  return { changes: result.changes }
}

// ─── GET /api/me/songs ───────────────────────────────────────

/**
 * Privades i arranjaments de l'usuari, amb l'original, la darrera proposta
 * rebutjada (si n'hi ha) i quants cançoners seus la contenen.
 */
export function listOwnPrivateSongs(userId: number) {
  const rows = db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      key: schema.songs.key,
      capo: schema.songs.capo,
      originalSongId: schema.songs.originalSongId,
      updatedAt: schema.songs.updatedAt,
      createdAt: schema.songs.createdAt,
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.ownerId, userId), eq(schema.songs.state, SONG_STATE.PRIVATE)))
    .orderBy(desc(schema.songs.updatedAt))
    .all()

  const originalIds = [...new Set(rows.map((r) => r.originalSongId).filter((v): v is number => v !== null))]
  const originals = new Map<number, { id: number; title: string; artist: string; artist_slug: string | null; song_slug: string | null }>()
  for (const id of originalIds) {
    const o = db
      .select({
        id: schema.songs.id,
        title: schema.songs.title,
        artist: schema.songs.artist,
        artistSlug: schema.songs.artistSlug,
        songSlug: schema.songs.songSlug,
      })
      .from(schema.songs)
      .where(eq(schema.songs.id, id))
      .get()
    if (o) originals.set(id, { id: o.id, title: o.title, artist: o.artist, artist_slug: o.artistSlug, song_slug: o.songSlug })
  }

  // Només compta la darrera proposta de cada cançó, si és rebutjada.
  const rejected = new Map<number, string>()
  const propRows = db
    .select({ songId: schema.songProposals.songId, status: schema.songProposals.status, notes: schema.songProposals.notes })
    .from(schema.songProposals)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.songProposals.songId))
    .where(and(eq(schema.songs.ownerId, userId), eq(schema.songs.state, SONG_STATE.PRIVATE)))
    .orderBy(asc(schema.songProposals.id))
    .all()
  for (const r of propRows) {
    if (r.status === "rejected") rejected.set(r.songId, r.notes ?? "")
    else rejected.delete(r.songId)
  }

  const counts = new Map<number, number>()
  const countRows = db
    .select({ songId: schema.canconerSongs.songId, n: count(schema.canconerSongs.id) })
    .from(schema.canconerSongs)
    .innerJoin(schema.canconers, eq(schema.canconers.id, schema.canconerSongs.canconerId))
    .where(eq(schema.canconers.userId, userId))
    .groupBy(schema.canconerSongs.songId)
    .all()
  for (const r of countRows) counts.set(r.songId, r.n)

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    key: r.key,
    capo: r.capo ?? 0,
    kind: r.originalSongId !== null ? ("arrangement" as const) : ("private" as const),
    original: r.originalSongId !== null ? (originals.get(r.originalSongId) ?? null) : null,
    rejection_notes: rejected.has(r.id) ? rejected.get(r.id)! : null,
    songbook_count: counts.get(r.id) ?? 0,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }))
}

// ─── PUT /api/songs/[id] ─────────────────────────────────────

export async function updateSong(
  id: number,
  data: Partial<{
    title: string
    artist: string
    key: string
    capo: number
    content: string
    language: string
    tags: string
    album: string | null
    year: number | null
    youtubeUrl: string | null
    spotifyUrl: string | null
    bpm: number | null
    timeSignature: string | null
  }>,
) {
  // L'estat no es canvia per aquí: changeSongKind / propostes.
  const touchesContent = SONG_CONTENT_KEYS.some((k) => k in data)
  const updates = touchesContent
    ? { ...data, updatedAt: sql`(datetime('now'))` }
    : data

  const result = db
    .update(schema.songs)
    .set(updates)
    .where(eq(schema.songs.id, id))
    .run()

  return { changes: result.changes }
}

/** Estil d'acompanyament fixat per l'admin (null = el detectat). No toca `updated_at`. */
export function setSongRhythm(id: number, rhythm: string | null) {
  return db.update(schema.songs).set({ rhythm }).where(eq(schema.songs.id, id)).run()
}

// ─── DELETE /api/songs/[id] ──────────────────────────────────

export async function deleteSong(id: number) {
  const result = db
    .delete(schema.songs)
    .where(eq(schema.songs.id, id))
    .run()

  return { changes: result.changes }
}

// ─── Cerca pública (Fase 3) ──────────────────────────────────

/**
 * Cerca cançons públiques (state=0) per `title` o `artist`.
 *
 * Estratègia anti-diacrítics: cerquem tant en els camps textuals com en els
 * slugs (que ja són ASCII), perquè un usuari que escriu "canco" trobi
 * "Cançó". El terme es passa per `slugify` per generar la versió ASCII.
 */
export async function searchPublicSongs(q: string, limit: number) {
  const trimmed = q.trim()
  if (!trimmed) return []

  const like1 = `%${trimmed}%`
  const slugQ = `%${slugify(trimmed)}%`

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
        or(
          like(schema.songs.title, like1),
          like(schema.songs.artist, like1),
          like(schema.songs.artistSlug, slugQ),
          like(schema.songs.songSlug, slugQ),
        )!,
      ),
    )
    .orderBy(asc(schema.songs.artist), asc(schema.songs.title))
    .limit(limit)

  return rows.map(mapSongSummary)
}

/**
 * Cançons pròpies de l'usuari (privades, arranjaments i propostes pendents)
 * per a la cerca del hero. Enllacen al visor privat.
 */
export async function searchOwnSongs(q: string, userId: number, limit: number) {
  const trimmed = q.trim()
  const like1 = `%${trimmed}%`
  const conditions = [eq(schema.songs.ownerId, userId), ne(schema.songs.state, SONG_STATE.PUBLIC)]
  if (trimmed) {
    conditions.push(or(like(schema.songs.title, like1), like(schema.songs.artist, like1))!)
  }
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
      state: schema.songs.state,
      ownerId: schema.songs.ownerId,
      originalSongId: schema.songs.originalSongId,
    })
    .from(schema.songs)
    .where(and(...conditions))
    .orderBy(trimmed ? asc(schema.songs.title) : desc(schema.songs.updatedAt))
    .limit(limit)
  return rows.map(mapSongListItem)
}

/**
 * Cerca artistes (deduplicats per `artist_slug`) amb comptador de cançons.
 * Inclou la cerca per slug per cobrir variants amb/sense diacrítics.
 */
export async function searchPublicArtists(q: string, limit: number) {
  const trimmed = q.trim()
  if (!trimmed) return []

  const like1 = `%${trimmed}%`
  const slugQ = `%${slugify(trimmed)}%`

  const rows = await db
    .select({
      name: schema.songs.artist,
      slug: schema.songs.artistSlug,
      song_count: count(schema.songs.id),
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        or(like(schema.songs.artist, like1), like(schema.songs.artistSlug, slugQ))!,
      ),
    )
    .groupBy(schema.songs.artistSlug)
    .orderBy(asc(schema.songs.artist))
    .limit(limit)

  return rows
    .filter((r): r is { name: string; slug: string; song_count: number } => r.slug !== null)
    .map((r) => ({ name: r.name, slug: r.slug, song_count: r.song_count }))
}

/** Cançons més recents (públiques). Usat com a fallback de la cerca quan `q` és buit. */
export async function listRecentPublicSongs(limit: number) {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )
    .orderBy(desc(schema.songs.createdAt))
    .limit(limit)

  return rows.map(mapSongSummary)
}

/**
 * Una cançó pública al·leatòria, opcionalment excloent un id (per re-tirar
 * el dau sense repetir el mateix resultat). Si no n'hi ha cap, retorna null.
 *
 * Usa `ORDER BY RANDOM()` de SQLite — barat fins a milers de files.
 */
export async function getRandomPublicSong(excludeId?: number) {
  const rows = await getRandomPublicSongs(1, excludeId !== undefined ? [excludeId] : [])
  return rows[0] ?? null
}

/**
 * N cançons públiques al·leatòries, opcionalment excloent un conjunt d'ids
 * (per re-tirar el dau sense repetir els resultats actuals).
 */
export async function getRandomPublicSongs(count: number, excludeIds: number[] = []) {
  const conditions = [
    eq(schema.songs.state, 0),
    isNotNull(schema.songs.artistSlug),
    isNotNull(schema.songs.songSlug),
  ]
  const validIds = excludeIds.filter((id) => Number.isFinite(id))
  if (validIds.length > 0) {
    conditions.push(sql`${schema.songs.id} NOT IN (${sql.join(validIds.map((id) => sql`${id}`), sql`, `)})`)
  }

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(Math.max(1, count))

  return rows.map(mapSongSummary)
}

/**
 * Índex de cançons agrupades per inicial del títol. Retorna `{ A: [...], B: [...] }`.
 * Caràcters no alfanumèrics o numèrics s'agrupen com a "#".
 */
export async function getPublicSongsByLetter() {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )
    .orderBy(asc(schema.songs.title))

  const groups: Record<string, Array<{
    id: number
    title: string
    artist: string
    artist_slug: string
    song_slug: string
    key: string
  }>> = {}

  for (const r of rows) {
    if (!r.artistSlug || !r.songSlug) continue
    const initial = initialLetterOf(r.title)
    if (!groups[initial]) groups[initial] = []
    groups[initial].push({
      id: r.id,
      title: r.title,
      artist: r.artist,
      artist_slug: r.artistSlug,
      song_slug: r.songSlug,
      key: r.key,
    })
  }

  return groups
}

/**
 * Índex d'artistes agrupats per inicial del nom. Retorna `{ A: [...], B: [...] }`.
 */
export async function getPublicArtistsByLetter() {
  const rows = await db
    .select({
      name: schema.songs.artist,
      slug: schema.songs.artistSlug,
      song_count: count(schema.songs.id),
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.state, 0), isNotNull(schema.songs.artistSlug)))
    .groupBy(schema.songs.artistSlug)
    .orderBy(asc(schema.songs.artist))

  const groups: Record<string, Array<{ name: string; slug: string; song_count: number }>> = {}
  for (const r of rows) {
    if (!r.slug) continue
    const initial = initialLetterOf(r.name)
    if (!groups[initial]) groups[initial] = []
    groups[initial].push({ name: r.name, slug: r.slug, song_count: r.song_count })
  }
  return groups
}

function initialLetterOf(text: string): string {
  const ch = text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().charAt(0).toUpperCase()
  if (ch >= "A" && ch <= "Z") return ch
  return "#"
}

/**
 * Llista mínima per al sitemap: totes les parelles (artist_slug, song_slug)
 * públiques amb la seva data de darrera modificació.
 */
export async function listPublicSongsForSitemap() {
  const rows = await db
    .select({
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      updatedAt: schema.songs.updatedAt,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )

  return rows
    .filter(
      (r): r is { artistSlug: string; songSlug: string; updatedAt: string | null } =>
        r.artistSlug !== null && r.songSlug !== null,
    )
    .map((r) => ({
      artistSlug: r.artistSlug,
      songSlug: r.songSlug,
      updatedAt: r.updatedAt,
    }))
}

/**
 * Llista mínima d'artistes únics per al sitemap.
 * Retorna l'`updatedAt` més recent del grup d'artist (proxy de "darrera
 * actualització" de la pàgina d'artista).
 */
export async function listPublicArtistsForSitemap() {
  const rows = await db
    .select({
      artistSlug: schema.songs.artistSlug,
      lastUpdated: sql<string | null>`MAX(${schema.songs.updatedAt})`,
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.state, 0), isNotNull(schema.songs.artistSlug)))
    .groupBy(schema.songs.artistSlug)

  return rows
    .filter((r): r is { artistSlug: string; lastUpdated: string | null } => r.artistSlug !== null)
    .map((r) => ({ artistSlug: r.artistSlug, updatedAt: r.lastUpdated }))
}

/** Cançó per la parella (artist_slug, song_slug). Només cançons públiques. */
export async function getSongBySlug(artistSlug: string, songSlug: string) {
  const [song] = await db
    .select()
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.artistSlug, artistSlug),
        eq(schema.songs.songSlug, songSlug),
        eq(schema.songs.state, 0),
      ),
    )
    .limit(1)

  if (!song) return null
  return mapSong(song)
}

/**
 * Totes les cançons públiques d'un artista (per `artist_slug`).
 * Retorna `null` si l'artista no té cançons públiques.
 */
export async function getArtistBySlug(slug: string) {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      year: schema.songs.year,
      album: schema.songs.album,
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.artistSlug, slug), eq(schema.songs.state, 0)))
    .orderBy(asc(schema.songs.title))

  if (rows.length === 0) return null

  const name = rows[0].artist
  return {
    name,
    slug,
    songs: rows
      .filter((r): r is typeof r & { songSlug: string } => r.songSlug !== null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        song_slug: r.songSlug,
        key: r.key,
        year: r.year,
        album: r.album,
      })),
  }
}
