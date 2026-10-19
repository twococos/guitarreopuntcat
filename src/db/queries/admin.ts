import { and, asc, eq, inArray, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { db, schema } from "@/db/client"
import { SONG_STATE, songKind } from "@/lib/songKind"
import { getAnalysisSummaries } from "./transcriptions"

// ─── GET /api/admin/stats ────────────────────────────────────

export async function getStats() {
  const [songsRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songs)
    .where(eq(schema.songs.state, SONG_STATE.PUBLIC))

  const [draftsRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songs)
    .where(eq(schema.songs.state, SONG_STATE.PENDING))

  const [usersRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.users)

  const [canconersRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.canconers)

  const [pendingRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.status, "pending"))

  return {
    songs: songsRow?.count ?? 0,
    drafts: draftsRow?.count ?? 0,
    users: usersRow?.count ?? 0,
    canconers: canconersRow?.count ?? 0,
    pending: pendingRow?.count ?? 0,
  }
}

// ─── GET /api/admin/users ────────────────────────────────────

export async function listAllUsers() {
  const rows = await db
    .select({
      id: schema.users.id,
      googleId: schema.users.googleId,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      role: schema.users.role,
      active: schema.users.active,
      createdAt: schema.users.createdAt,
      canconer_count: sql<number>`COUNT(${schema.canconers.id})`.as("canconer_count"),
    })
    .from(schema.users)
    .leftJoin(schema.canconers, eq(schema.canconers.userId, schema.users.id))
    .groupBy(schema.users.id)
    .orderBy(schema.users.createdAt)

  return rows.map((r) => ({
    id: r.id,
    google_id: r.googleId,
    email: r.email,
    name: r.name,
    avatar_url: r.avatarUrl,
    role: r.role,
    active: r.active,
    created_at: r.createdAt,
    canconer_count: r.canconer_count,
  }))
}

// ─── PATCH /api/admin/users/[id] ─────────────────────────────

export async function updateUser(
  targetId: number,
  requesterId: number,
  updates: { role?: "user" | "admin"; active?: boolean },
) {
  if (
    updates.role !== undefined &&
    updates.role !== "admin" &&
    targetId === requesterId
  ) {
    return { error: "No et pots treure el rol d'admin a tu mateix", status: 400 }
  }

  const set: Record<string, unknown> = {}
  if (updates.role !== undefined) set.role = updates.role
  if (updates.active !== undefined) set.active = updates.active ? 1 : 0

  if (Object.keys(set).length === 0) {
    return { error: "Res a actualitzar", status: 400 }
  }

  db.update(schema.users).set(set).where(eq(schema.users.id, targetId)).run()

  return { ok: true }
}

// ─── GET /api/admin/canconers ────────────────────────────────

export async function listAllCanconers() {
  const rows = await db
    .select({
      id: schema.canconers.id,
      userId: schema.canconers.userId,
      title: schema.canconers.title,
      shareToken: schema.canconers.shareToken,
      visibility: schema.canconers.visibility,
      slug: schema.canconers.slug,
      createdAt: schema.canconers.createdAt,
      updatedAt: schema.canconers.updatedAt,
      ownerName: schema.users.name,
      song_count: sql<number>`COUNT(${schema.canconerSongs.id})`.as("song_count"),
    })
    .from(schema.canconers)
    .innerJoin(schema.users, eq(schema.users.id, schema.canconers.userId))
    .leftJoin(schema.canconerSongs, eq(schema.canconerSongs.canconerId, schema.canconers.id))
    .groupBy(schema.canconers.id)
    .orderBy(sql`${schema.canconers.updatedAt} DESC`)

  return rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    title: r.title,
    share_token: r.shareToken,
    visibility: r.visibility,
    slug: r.slug,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    owner_name: r.ownerName,
    song_count: r.song_count,
  }))
}

// ─── DELETE /api/admin/canconers/[id] ────────────────────────

export async function adminDeleteCanconer(id: number) {
  const result = db
    .delete(schema.canconers)
    .where(eq(schema.canconers.id, id))
    .run()

  return { changes: result.changes }
}

// ─── GET /api/admin/songs ────────────────────────────────────

export type AdminSongKindFilter = "all" | "public" | "private" | "arrangement"
export type AdminAnalysisFilter = "any" | "none" | "bad"

/**
 * Cançons per al panell d'admin (sense les propostes pendents, que tenen la
 * seva pestanya): tipus, propietari, original, anàlisi i en quants cançoners
 * surt. Els filtres de tipus i cerca van a SQL; el d'anàlisi, després (depèn
 * de la qualitat calculada).
 */
export function listSongsForAdmin(opts: {
  kind: AdminSongKindFilter
  search?: string
  analysis: AdminAnalysisFilter
}) {
  const original = alias(schema.songs, "original")
  const conditions: SQL[] = [ne(schema.songs.state, SONG_STATE.PENDING)]
  if (opts.kind === "public") conditions.push(eq(schema.songs.state, SONG_STATE.PUBLIC))
  if (opts.kind === "private") {
    conditions.push(eq(schema.songs.state, SONG_STATE.PRIVATE), isNull(schema.songs.originalSongId))
  }
  if (opts.kind === "arrangement") {
    conditions.push(eq(schema.songs.state, SONG_STATE.PRIVATE), isNotNull(schema.songs.originalSongId))
  }
  const q = opts.search?.trim()
  if (q) {
    const id = Number(q.replace(/^#/, ""))
    const text = or(like(schema.songs.title, `%${q}%`), like(schema.songs.artist, `%${q}%`))!
    conditions.push(Number.isInteger(id) && id > 0 ? or(text, eq(schema.songs.id, id))! : text)
  }

  const rows = db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      state: schema.songs.state,
      originalSongId: schema.songs.originalSongId,
      updatedAt: schema.songs.updatedAt,
      ownerId: schema.users.id,
      ownerName: schema.users.name,
      ownerAvatar: schema.users.avatarUrl,
      originalTitle: original.title,
      originalArtist: original.artist,
      songbookCount: sql<number>`(SELECT COUNT(DISTINCT ${schema.canconerSongs.canconerId}) FROM ${schema.canconerSongs} WHERE ${schema.canconerSongs.songId} = ${schema.songs.id})`,
    })
    .from(schema.songs)
    .leftJoin(schema.users, eq(schema.users.id, schema.songs.ownerId))
    .leftJoin(original, eq(original.id, schema.songs.originalSongId))
    .where(and(...conditions))
    .orderBy(asc(schema.songs.title))
    .all()

  const analyses = getAnalysisSummaries(rows.map((r) => r.id))

  const mapped = rows.map((r) => {
    const a = analyses.get(r.id)
    return {
      id: r.id,
      title: r.title,
      artist: r.artist,
      artist_slug: r.artistSlug,
      song_slug: r.songSlug,
      key: r.key,
      state: r.state,
      kind: songKind(r.state, r.originalSongId),
      owner: r.ownerId !== null ? { id: r.ownerId, name: r.ownerName ?? "", avatar_url: r.ownerAvatar } : null,
      original: r.originalSongId !== null
        ? { id: r.originalSongId, title: r.originalTitle ?? "", artist: r.originalArtist ?? "" }
        : null,
      analysis: a ? { current: a.current, quality: a.quality } : null,
      songbook_count: r.songbookCount,
      updated_at: r.updatedAt,
    }
  })

  if (opts.analysis === "none") return mapped.filter((m) => !m.analysis || !m.analysis.current)
  if (opts.analysis === "bad") {
    return mapped.filter((m) => m.analysis?.current && !m.analysis.quality?.ok)
  }
  return mapped
}

export type AdminSongRow = ReturnType<typeof listSongsForAdmin>[number]

/** Comptadors per tipus per als xips del filtre (sense propostes). */
export function countSongsByKind() {
  const rows = db
    .select({
      state: schema.songs.state,
      arrangement: sql<number>`${schema.songs.originalSongId} IS NOT NULL`,
      n: sql<number>`COUNT(*)`,
    })
    .from(schema.songs)
    .where(ne(schema.songs.state, SONG_STATE.PENDING))
    .groupBy(schema.songs.state, sql`${schema.songs.originalSongId} IS NOT NULL`)
    .all()
  const counts = { all: 0, public: 0, private: 0, arrangement: 0 }
  for (const r of rows) {
    const k = songKind(r.state, r.arrangement ? 1 : null)
    if (k === "public" || k === "private" || k === "arrangement") counts[k] += r.n
    counts.all += r.n
  }
  return counts
}

/** L'usuari existeix (per assignar-li una cançó). */
export function userExists(id: number): boolean {
  return !!db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).get()
}

export function songbookOwnersOf(songId: number): number[] {
  return db
    .selectDistinct({ userId: schema.canconers.userId })
    .from(schema.canconerSongs)
    .innerJoin(schema.canconers, eq(schema.canconers.id, schema.canconerSongs.canconerId))
    .where(inArray(schema.canconerSongs.songId, [songId]))
    .all()
    .map((r) => r.userId)
}

