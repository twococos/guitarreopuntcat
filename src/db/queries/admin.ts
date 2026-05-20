import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"

// ─── GET /api/admin/stats ────────────────────────────────────

export async function getStats() {
  const [songsRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songs)
    .where(eq(schema.songs.draft, 0))

  const [draftsRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songs)
    .where(eq(schema.songs.draft, 1))

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
