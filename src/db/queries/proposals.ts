import { and, eq, ne, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"
import type { ProposalInput } from "@/lib/schemas/proposal"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { slugsForPublishing } from "./songs"
import { SONG_STATE } from "@/lib/songKind"

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
      songAlbum: schema.songs.album,
      songYear: schema.songs.year,
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
    song_album: r.songAlbum,
    song_year: r.songYear,
    proposer_name: r.proposerName,
    proposer_avatar: r.proposerAvatar,
    reviewer_name: r.reviewerId ? (reviewerMap[r.reviewerId] ?? null) : null,
  }))
}

// ─── POST /api/proposals ─────────────────────────────────────

// Les propostes es creen sense slug: el reben en aprovar-se (slugsForPublishing).
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
        state: SONG_STATE.PENDING,
        ownerId: userId,
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

// ─── Bulk import (admin: /app/admin/import) ──────────────────
// Variant de createProposal sense schema Zod estricte: accepta YouTube/Spotify
// buits (null) i el revisor els podrà afegir manualment. Mateix flux
// d'inserció (sense slugs fins que s'aprova).

export interface BulkProposalInput {
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
}

export function createBulkProposal(
  userId: number,
  data: BulkProposalInput,
): { songId: number; proposalId: number } {
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
        album: data.album,
        year: data.year,
        youtubeUrl: data.youtubeUrl,
        spotifyUrl: data.spotifyUrl,
        state: SONG_STATE.PENDING,
        ownerId: userId,
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

/**
 * Comprova si ja existeix una cançó pública o pendent amb el mateix
 * artista+títol (ignorant majúscules/espais). Útil per a la importació
 * massiva: si en trobem una, saltem la fila i la marquem com a duplicat.
 * Les privades (incloses les propostes rebutjades) no compten: són d'un
 * usuari i no impedeixen que la cançó entri al catàleg.
 */
export function findExistingSongByArtistTitle(
  artist: string,
  title: string,
): { id: number; state: number } | null {
  const norm = (s: string) => s.trim().toLowerCase()
  const a = norm(artist)
  const t = norm(title)
  const row = db
    .select({ id: schema.songs.id, artist: schema.songs.artist, title: schema.songs.title, state: schema.songs.state })
    .from(schema.songs)
    .all()
    .find((r) => norm(r.artist) === a && norm(r.title) === t && r.state !== SONG_STATE.PRIVATE)
  return row ? { id: row.id, state: row.state } : null
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

  // En publicar-se, la cançó deixa de tenir propietari i rep els slugs.
  const published = {
    state: SONG_STATE.PUBLIC,
    ownerId: null,
    originalSongId: null,
    ...(status === "approved" ? (slugsForPublishing(proposal.songId) ?? {}) : {}),
  }

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
            ...published,
            updatedAt: sql`(datetime('now'))`,
          })
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      } else {
        tx
          .update(schema.songs)
          .set({ ...published, updatedAt: sql`(datetime('now'))` })
          .where(eq(schema.songs.id, proposal.songId))
          .run()
      }
    } else {
      // Rebutjada: la cançó queda com a privada del propietari, que la pot
      // modificar i tornar a proposar.
      tx
        .update(schema.songs)
        .set({ state: SONG_STATE.PRIVATE, updatedAt: sql`(datetime('now'))` })
        .where(eq(schema.songs.id, proposal.songId))
        .run()
    }
  })

  return { ok: true }
}

// ─── POST /api/proposals/[id]/cancel ─────────────────────────
// L'usuari propietari retira la seva proposta. La cançó queda com a privada
// seva i la proposta passa a status="cancelled" (visible a l'admin per
// traçabilitat, però no a la llista de l'usuari).

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
      .set({ state: SONG_STATE.PRIVATE, updatedAt: sql`(datetime('now'))` })
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
        state: SONG_STATE.PENDING,
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

// ─── POST /api/songs/[id]/propose ────────────────────────────
// L'usuari proposa com a pública una privada seva (no un arranjament). Si
// la darrera proposta d'aquesta cançó va ser rebutjada o retirada, la
// reaprofita i la marca com a re-enviada; si no, en crea una de nova.

export function proposeOwnSong(songId: number, userId: number, data: ProposalInput) {
  const song = db
    .select({ state: schema.songs.state, ownerId: schema.songs.ownerId, originalSongId: schema.songs.originalSongId })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId))
    .get()

  if (!song || song.ownerId !== userId) return { error: "Cançó no trobada", status: 404 as const }
  if (song.state !== SONG_STATE.PRIVATE) {
    return { error: "Només es poden proposar cançons privades", status: 400 as const }
  }
  if (song.originalSongId !== null) {
    return { error: "Un arranjament no es pot proposar com a cançó pública", status: 400 as const }
  }

  const [last] = db
    .select({ id: schema.songProposals.id, status: schema.songProposals.status })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.songId, songId))
    .orderBy(sql`${schema.songProposals.id} DESC`)
    .limit(1)
    .all()

  const now = new Date().toISOString().replace("T", " ").slice(0, 19)
  let proposalId!: number

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
        state: SONG_STATE.PENDING,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(schema.songs.id, songId))
      .run()

    if (last && (last.status === "rejected" || last.status === "cancelled")) {
      tx
        .update(schema.songProposals)
        .set({ status: "pending", resubmittedAt: now, reviewerId: null, reviewedAt: null })
        .where(eq(schema.songProposals.id, last.id))
        .run()
      proposalId = last.id
    } else {
      const r = tx.insert(schema.songProposals).values({ userId, songId }).run()
      proposalId = Number(r.lastInsertRowid)
    }
  })

  return { ok: true as const, proposalId }
}


/**
 * Admin: torna una cançó (pública, privada o arranjament) a la cua de
 * propostes, a nom del seu propietari (o de l'admin si no en té). Perd
 * l'original, com qualsevol proposta. Reaprofita la darrera proposta tancada
 * de la cançó si n'hi ha.
 */
export function moveSongToProposals(songId: number, fallbackOwnerId: number) {
  const song = db
    .select({ state: schema.songs.state, ownerId: schema.songs.ownerId })
    .from(schema.songs)
    .where(eq(schema.songs.id, songId))
    .get()
  if (!song) return { error: "Cançó no trobada", status: 404 as const }
  if (song.state === SONG_STATE.PENDING) return { error: "Ja és una proposta", status: 400 as const }

  const ownerId = song.ownerId ?? fallbackOwnerId
  const [last] = db
    .select({ id: schema.songProposals.id })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.songId, songId))
    .orderBy(sql`${schema.songProposals.id} DESC`)
    .limit(1)
    .all()
  const now = new Date().toISOString().replace("T", " ").slice(0, 19)
  let proposalId!: number

  db.transaction((tx) => {
    tx
      .update(schema.songs)
      .set({ state: SONG_STATE.PENDING, ownerId, originalSongId: null })
      .where(eq(schema.songs.id, songId))
      .run()
    if (last) {
      tx
        .update(schema.songProposals)
        .set({ status: "pending", userId: ownerId, resubmittedAt: now, reviewerId: null, reviewedAt: null })
        .where(eq(schema.songProposals.id, last.id))
        .run()
      proposalId = last.id
    } else {
      proposalId = Number(tx.insert(schema.songProposals).values({ userId: ownerId, songId }).run().lastInsertRowid)
    }
  })
  return { ok: true as const, proposalId }
}

export async function getPendingCount() {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)`.as("count") })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.status, "pending"))

  return { count: row?.count ?? 0 }
}
