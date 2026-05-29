import { and, eq, ne, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"
import type { ProposalInput } from "@/lib/schemas/proposal"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { generateSlugsForNewSong } from "./songs"

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
      resubmittedAt: schema.songProposals.resubmittedAt,
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
  // Per a no-admins: exclou propostes cancel·lades (l'usuari les ha descartat).
  const whereClause = isAdmin
    ? undefined
    : and(
        eq(schema.songProposals.userId, userId),
        ne(schema.songProposals.status, "cancelled"),
      )

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
    resubmitted_at: r.resubmittedAt,
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

  const { artistSlug, songSlug } = generateSlugsForNewSong(data.artist, data.title)

  db.transaction((tx) => {
    const songResult = tx
      .insert(schema.songs)
      .values({
        title: data.title,
        artist: data.artist,
        artistSlug,
        songSlug,
        key: data.key,
        capo: data.capo,
        content: data.content,
        language: data.language,
        tags: data.tags,
        album: data.album ?? null,
        year: data.year ?? null,
        youtubeUrl: data.youtubeUrl,
        spotifyUrl: data.spotifyUrl,
        state: 2, // pendent de revisió
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
            state: 0, // pública
            updatedAt: sql`(datetime('now'))`,
          })
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      } else {
        tx
          .update(schema.songs)
          .set({ state: 0, updatedAt: sql`(datetime('now'))` }) // pública
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      }
    } else {
      // Rebutjada: la cançó es conserva amb state=3 perquè el propietari
      // pugui modificar-la i re-enviar la proposta.
      tx
        .update(schema.songs)
        .set({ state: 3, updatedAt: sql`(datetime('now'))` })
        .where(eq(schema.songs.id, proposal.songId))
        .run()
    }
  })

  return { ok: true }
}

// ─── POST /api/proposals/[id]/cancel ─────────────────────────
// L'usuari propietari descarta la seva proposta. La cançó passa a
// state=4 (cancel·lada) i la proposta a status="cancelled". La proposta
// queda visible al panell admin però desapareix de la llista de l'usuari.

export async function cancelProposal(proposalId: number, userId: number) {
  const [proposal] = await db
    .select()
    .from(schema.songProposals)
    .where(eq(schema.songProposals.id, proposalId))
    .limit(1)

  if (!proposal) return { error: "Proposta no trobada", status: 404 as const }
  if (proposal.userId !== userId) return { error: "No autoritzat", status: 403 as const }
  if (proposal.status !== "pending" && proposal.status !== "rejected") {
    return { error: "Aquesta proposta no es pot cancel·lar", status: 400 as const }
  }

  db.transaction((tx) => {
    tx
      .update(schema.songProposals)
      .set({ status: "cancelled" })
      .where(eq(schema.songProposals.id, proposalId))
      .run()

    tx
      .update(schema.songs)
      .set({ state: 4, updatedAt: sql`(datetime('now'))` })
      .where(eq(schema.songs.id, proposal.songId))
      .run()
  })

  return { ok: true as const }
}

// ─── PUT /api/proposals/[id] ─────────────────────────────────
// L'usuari propietari modifica la seva proposta (pending o rejected) i la
// torna a enviar. La cançó s'actualitza i la proposta torna a status="pending".
// Si la proposta venia de "rejected", omplim resubmittedAt perquè els admins
// la puguin marcar visualment com a re-enviada.

export async function resubmitProposal(
  proposalId: number,
  userId: number,
  data: ProposalInput,
) {
  const [proposal] = await db
    .select()
    .from(schema.songProposals)
    .where(eq(schema.songProposals.id, proposalId))
    .limit(1)

  if (!proposal) return { error: "Proposta no trobada", status: 404 as const }
  if (proposal.userId !== userId) return { error: "No autoritzat", status: 403 as const }
  if (proposal.status !== "pending" && proposal.status !== "rejected") {
    return { error: "Aquesta proposta no es pot modificar", status: 400 as const }
  }

  const wasRejected = proposal.status === "rejected"
  const now = new Date().toISOString().replace("T", " ").slice(0, 19)

  db.transaction((tx) => {
    tx
      .update(schema.songs)
      .set({
        title: data.title,
        artist: data.artist,
        key: data.key,
        capo: data.capo,
        content: cleanupContent(data.content),
        language: data.language,
        tags: data.tags,
        album: data.album ?? null,
        year: data.year ?? null,
        youtubeUrl: data.youtubeUrl,
        spotifyUrl: data.spotifyUrl,
        state: 2, // pendent
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(schema.songs.id, proposal.songId))
      .run()

    tx
      .update(schema.songProposals)
      .set({
        status: "pending",
        // Si venia de rebutjada, marquem-la com a re-enviada (badge admin).
        // Si venia de pendent (l'usuari només l'ha retocada), preservem
        // qualsevol resubmittedAt previ.
        ...(wasRejected ? { resubmittedAt: now } : {}),
      })
      .where(eq(schema.songProposals.id, proposalId))
      .run()
  })

  return { ok: true as const }
}

// ─── GET /api/proposals/pending-count ────────────────────────

export async function getPendingCount() {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)`.as("count") })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.status, "pending"))

  return { count: row?.count ?? 0 }
}
