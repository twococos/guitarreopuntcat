import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"
import type { ProposalInput } from "@/lib/schemas/proposal"
import { cleanupContent } from "@/lib/importers/cleanupContent"

// ─── GET /api/proposals ──────────────────────────────────────

export async function listProposals(isAdmin: boolean, userId: number) {
  // We use a raw sql query to alias the two user joins clearly.
  // proposer = p_user, reviewer = r_user (LEFT JOIN)
  const proposer = db
    .select({
      id: schema.songProposals.id,
      userId: schema.songProposals.userId,
      songId: schema.songProposals.songId,
      status: schema.songProposals.status,
      reviewerId: schema.songProposals.reviewerId,
      notes: schema.songProposals.notes,
      createdAt: schema.songProposals.createdAt,
      reviewedAt: schema.songProposals.reviewedAt,
      songTitle: schema.songs.title,
      songArtist: schema.songs.artist,
      proposerName: schema.users.name,
      proposerAvatar: schema.users.avatarUrl,
    })
    .from(schema.songProposals)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.songProposals.songId))
    .innerJoin(schema.users, eq(schema.users.id, schema.songProposals.userId))

  // We need reviewer name via a subquery / raw sql approach because Drizzle
  // doesn't support aliased self-joins cleanly with the typed API.
  // We'll fetch reviewer names separately.
  const whereClause = isAdmin
    ? undefined
    : eq(schema.songProposals.userId, userId)

  const rows = whereClause
    ? await proposer.where(whereClause).orderBy(sql`${schema.songProposals.createdAt} DESC`)
    : await proposer.orderBy(sql`${schema.songProposals.createdAt} DESC`)

  // Fetch reviewer names for all unique reviewerIds
  const reviewerIds = [...new Set(rows.map((r) => r.reviewerId).filter((v): v is number => v !== null))]
  const reviewerMap: Record<number, string> = {}

  for (const rid of reviewerIds) {
    const [reviewer] = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, rid))
      .limit(1)
    if (reviewer) reviewerMap[rid] = reviewer.name
  }

  return rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    song_id: r.songId,
    status: r.status,
    reviewer_id: r.reviewerId,
    notes: r.notes,
    created_at: r.createdAt,
    reviewed_at: r.reviewedAt,
    song_title: r.songTitle,
    song_artist: r.songArtist,
    proposer_name: r.proposerName,
    proposer_avatar: r.proposerAvatar,
    reviewer_name: r.reviewerId ? (reviewerMap[r.reviewerId] ?? null) : null,
  }))
}

// ─── POST /api/proposals ─────────────────────────────────────

export async function createProposal(userId: number, data: ProposalInput) {
  let songId!: number
  let proposalId!: number

  db.transaction((tx) => {
    const songResult = tx
      .insert(schema.songs)
      .values({
        title: data.title,
        artist: data.artist,
        key: data.key,
        capo: data.capo,
        content: data.content,
        language: data.language,
        tags: data.tags,
        album: data.album ?? null,
        year: data.year ?? null,
        youtubeUrl: data.youtubeUrl,
        spotifyUrl: data.spotifyUrl,
        draft: 1,
      })
      .run()

    songId = Number(songResult.lastInsertRowid)

    const proposalResult = tx
      .insert(schema.songProposals)
      .values({ userId, songId })
      .run()

    proposalId = Number(proposalResult.lastInsertRowid)
  })

  return { songId, proposalId }
}

// ─── PATCH /api/proposals/[id] ───────────────────────────────

export async function reviewProposal(
  proposalId: number,
  reviewerId: number,
  status: "approved" | "rejected",
  notes: string,
  songUpdate?: ProposalInput,
) {
  const [proposal] = await db
    .select()
    .from(schema.songProposals)
    .where(eq(schema.songProposals.id, proposalId))
    .limit(1)

  if (!proposal) return { error: "Proposta no trobada", status: 404 }
  if (proposal.status !== "pending") return { error: "La proposta ja ha estat revisada", status: 400 }

  db.transaction((tx) => {
    tx
      .update(schema.songProposals)
      .set({
        status,
        reviewerId,
        notes,
        reviewedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      })
      .where(eq(schema.songProposals.id, proposalId))
      .run()

    if (status === "approved") {
      if (songUpdate) {
        tx
          .update(schema.songs)
          .set({
            title: songUpdate.title,
            artist: songUpdate.artist,
            key: songUpdate.key,
            capo: songUpdate.capo,
            content: cleanupContent(songUpdate.content),
            language: songUpdate.language,
            tags: songUpdate.tags,
            album: songUpdate.album ?? null,
            year: songUpdate.year ?? null,
            youtubeUrl: songUpdate.youtubeUrl,
            spotifyUrl: songUpdate.spotifyUrl,
            draft: 0,
            updatedAt: sql`(datetime('now'))`,
          })
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      } else {
        tx
          .update(schema.songs)
          .set({ draft: 0, updatedAt: sql`(datetime('now'))` })
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      }
    } else {
      tx.delete(schema.songs).where(eq(schema.songs.id, proposal.songId)).run()
    }
  })

  return { ok: true }
}

// ─── GET /api/proposals/pending-count ────────────────────────

export async function getPendingCount() {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)`.as("count") })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.status, "pending"))

  return { count: row?.count ?? 0 }
}
