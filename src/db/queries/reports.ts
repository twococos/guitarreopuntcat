import "server-only"
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { dedupeKey } from "@/lib/reports/dedupe"
import { KIND_CATEGORY, type ReportInput, type ReportItem } from "@/lib/schemas/report"

// ─── POST /api/songs/[id]/reports ────────────────────────────

/** Reports enviats des d'aquesta sessió o IP en els últims `minutes` minuts. */
export function countRecentReports(sessionHash: string, ipHash: string, minutes: number): number {
  const since = sql`datetime('now', ${`-${minutes} minutes`})`
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.songReports)
    .where(
      and(
        gte(schema.songReports.createdAt, since),
        or(eq(schema.songReports.sessionHash, sessionHash), eq(schema.songReports.ipHash, ipHash)),
      ),
    )
    .get()
  return row?.count ?? 0
}

export function createReport(
  songId: number,
  input: ReportInput,
  meta: {
    userId: number | null
    sessionHash: string
    ipHash: string
    source: "song" | "songbook" | "share"
    canconerId: number | null
  },
): number {
  return db.transaction((tx) => {
    const report = tx
      .insert(schema.songReports)
      .values({
        songId,
        userId: meta.userId,
        sessionHash: meta.sessionHash,
        ipHash: meta.ipHash,
        contentHash: input.content_hash,
        semitones: input.semitones,
        source: meta.source,
        canconerId: meta.canconerId,
        comment: input.comment,
      })
      .returning({ id: schema.songReports.id })
      .get()

    tx.insert(schema.songReportItems)
      .values(
        input.items.map((item) => ({
          reportId: report.id,
          category: KIND_CATEGORY[item.kind],
          kind: item.kind,
          payload: item,
          dedupeKey: dedupeKey(item),
        })),
      )
      .run()

    return report.id
  })
}

// ─── Admin ───────────────────────────────────────────────────

/** Reports amb alguna correcció pendent (comptador de la pestanya Errors). */
export function countPendingReports(): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.songReports)
    .where(eq(schema.songReports.status, "pending"))
    .get()
  return row?.count ?? 0
}

/** Cançons amb reports, la que té el més recent primer. */
export function listReportedSongs(status: "pending" | "resolved") {
  const r = schema.songReports
  const i = schema.songReportItems
  const s = schema.songs
  const pending = sql<number>`SUM(CASE WHEN ${i.status} = 'pending' THEN 1 ELSE 0 END)`
  const rows = db
    .select({
      songId: s.id,
      title: s.title,
      artist: s.artist,
      artistSlug: s.artistSlug,
      songSlug: s.songSlug,
      reports: sql<number>`COUNT(DISTINCT ${r.id})`,
      items: sql<number>`COUNT(${i.id})`,
      pendingItems: pending,
      pendingGroups: sql<number>`COUNT(DISTINCT CASE WHEN ${i.status} = 'pending' THEN ${i.dedupeKey} END)`,
      lastAt: sql<string>`MAX(${r.createdAt})`,
    })
    .from(r)
    .innerJoin(i, eq(i.reportId, r.id))
    .innerJoin(s, eq(s.id, r.songId))
    .groupBy(s.id)
    .having(status === "pending" ? sql`${pending} > 0` : sql`${pending} = 0`)
    .orderBy(desc(sql`MAX(${r.createdAt})`))
    .limit(200)
    .all()

  return rows.map((row) => ({
    song_id: row.songId,
    title: row.title,
    artist: row.artist,
    href: row.artistSlug && row.songSlug ? `/songs/${row.artistSlug}/${row.songSlug}` : null,
    reports: row.reports,
    items: row.items,
    pending_items: row.pendingItems,
    pending_groups: row.pendingGroups,
    last_at: row.lastAt,
  }))
}

export interface ReportGroup {
  dedupe_key: string
  kind: ReportItem["kind"]
  category: string
  status: "pending" | "applied" | "rejected"
  /** Ítem representatiu (el més antic) i tots els del grup. */
  item: ReportItem
  item_ids: number[]
  count: number
  semitones: number
  content_hash: string
  comments: string[]
  users: string[]
  first_at: string | null
  last_at: string | null
}

/** Ítems d'una cançó agrupats per `dedupe_key` (pendents primer). */
export function getSongReportGroups(songId: number): ReportGroup[] {
  const r = schema.songReports
  const i = schema.songReportItems
  const rows = db
    .select({
      id: i.id,
      status: i.status,
      kind: i.kind,
      category: i.category,
      payload: i.payload,
      dedupeKey: i.dedupeKey,
      semitones: r.semitones,
      contentHash: r.contentHash,
      comment: r.comment,
      createdAt: r.createdAt,
      userName: schema.users.name,
    })
    .from(i)
    .innerJoin(r, eq(r.id, i.reportId))
    .leftJoin(schema.users, eq(schema.users.id, r.userId))
    .where(eq(r.songId, songId))
    .orderBy(i.id)
    .all()

  const groups = new Map<string, ReportGroup>()
  for (const row of rows) {
    // Un grup aplicat i un de pendent amb la mateixa clau són coses diferents
    const key = `${row.status}|${row.dedupeKey}`
    let g = groups.get(key)
    if (!g) {
      g = {
        dedupe_key: row.dedupeKey,
        kind: row.payload.kind,
        category: row.category,
        status: row.status,
        item: row.payload,
        item_ids: [],
        count: 0,
        semitones: row.semitones,
        content_hash: row.contentHash,
        comments: [],
        users: [],
        first_at: row.createdAt,
        last_at: row.createdAt,
      }
      groups.set(key, g)
    }
    g.item_ids.push(row.id)
    g.count++
    g.last_at = row.createdAt
    if (row.comment && !g.comments.includes(row.comment)) g.comments.push(row.comment)
    if (row.userName && !g.users.includes(row.userName)) g.users.push(row.userName)
  }

  const order = { pending: 0, applied: 1, rejected: 2 }
  return [...groups.values()].sort((a, b) => order[a.status] - order[b.status])
}

/**
 * Ítems pendents d'una cançó per aplicar: els demanats i els seus duplicats
 * (mateixa `dedupe_key`), perquè tot el grup quedi resolt alhora. Es retorna un
 * representant per grup (el que s'aplica) i tots els ids.
 */
export function getPendingItemsForApply(songId: number, itemIds: number[]) {
  const r = schema.songReports
  const i = schema.songReportItems
  const rows = db
    .select({ id: i.id, payload: i.payload, dedupeKey: i.dedupeKey })
    .from(i)
    .innerJoin(r, eq(r.id, i.reportId))
    .where(and(eq(r.songId, songId), eq(i.status, "pending")))
    .orderBy(i.id)
    .all()

  const wanted = new Set(rows.filter((row) => itemIds.includes(row.id)).map((row) => row.dedupeKey))
  const representatives: { id: number; item: ReportItem }[] = []
  const membersOf = new Map<number, number[]>()
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (!wanted.has(row.dedupeKey)) continue
    const rep = seen.get(row.dedupeKey)
    if (rep === undefined) {
      seen.set(row.dedupeKey, row.id)
      representatives.push({ id: row.id, item: row.payload })
      membersOf.set(row.id, [row.id])
    } else {
      membersOf.get(rep)?.push(row.id)
    }
  }
  return { representatives, membersOf }
}

/** Marca ítems com a aplicats o rebutjats i tanca els reports que ja no en tenen cap de pendent. */
export function reviewItems(itemIds: number[], status: "applied" | "rejected", reviewerId: number): void {
  if (!itemIds.length) return
  const i = schema.songReportItems
  db.transaction((tx) => {
    tx.update(i)
      .set({ status, reviewerId, reviewedAt: sql`(datetime('now'))` })
      .where(and(inArray(i.id, itemIds), eq(i.status, "pending")))
      .run()

    const reportIds = tx
      .selectDistinct({ id: i.reportId })
      .from(i)
      .where(inArray(i.id, itemIds))
      .all()
      .map((row) => row.id)
    if (!reportIds.length) return

    tx.update(schema.songReports)
      .set({ status: "resolved", resolvedAt: sql`(datetime('now'))` })
      .where(
        and(
          inArray(schema.songReports.id, reportIds),
          sql`NOT EXISTS (SELECT 1 FROM ${i} WHERE ${i.reportId} = ${schema.songReports.id} AND ${i.status} = 'pending')`,
        ),
      )
      .run()
  })
}

/** Rebutja ítems i tots els seus duplicats pendents de la mateixa cançó. */
export function expandWithDuplicates(itemIds: number[]): number[] {
  const i = schema.songReportItems
  const r = schema.songReports
  const picked = db
    .select({ dedupeKey: i.dedupeKey, songId: r.songId })
    .from(i)
    .innerJoin(r, eq(r.id, i.reportId))
    .where(inArray(i.id, itemIds))
    .all()
  if (!picked.length) return []
  const all = db
    .select({ id: i.id, dedupeKey: i.dedupeKey, songId: r.songId })
    .from(i)
    .innerJoin(r, eq(r.id, i.reportId))
    .where(and(eq(i.status, "pending"), inArray(i.dedupeKey, picked.map((p) => p.dedupeKey))))
    .all()
  const keys = new Set(picked.map((p) => `${p.songId}|${p.dedupeKey}`))
  return all.filter((row) => keys.has(`${row.songId}|${row.dedupeKey}`)).map((row) => row.id)
}
