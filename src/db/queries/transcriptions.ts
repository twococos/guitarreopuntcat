import "server-only"
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"
import type { TranscriptionJob, TranscriptionWorker } from "@/db/schema"
import type { AnalysisCompact, EnqueueJob, WorkerDeviceInfo } from "@/lib/schemas/transcriber"
import type { z } from "zod"
import type { proposalResultSchema } from "@/lib/schemas/transcriber"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { normalizeSectionTitles } from "@/lib/importers/normalizeSections"
import { youtubeVideoId } from "@/lib/youtube"
import { getOrCreateTranscriberUser } from "@/lib/transcriber/transcriberUser"
import { generateWorkerToken, hashWorkerToken } from "@/lib/transcriber/auth.server"
import { findExistingSongByArtistTitle } from "./proposals"
import { generateSlugsForNewSong } from "./songs"

/**
 * Cua de transcripcions (vegeu docs/api_worker.md del repo transcriptor).
 *
 * Tot és síncron (better-sqlite3) i corre en un sol procés: una transacció és
 * suficient perquè dos workers no agafin mai la mateixa feina. Les dates es
 * guarden com `datetime('now')` de SQLite ("YYYY-MM-DD HH:MM:SS", UTC) perquè
 * es puguin comparar com a text.
 */

export const LEASE_SECONDS = 600
export const MAX_ATTEMPTS = 3
/** Espera abans del primer reintent; es dobla a cada intent (1 h, 2 h, 4 h…). */
const RETRY_BASE_SECONDS = 3600

const NOW = sql`datetime('now')`
const ACTIVE_STATUSES: TranscriptionJob["status"][] = ["queued", "running"]

type ProposalResult = z.infer<typeof proposalResultSchema>

// ─── Lease ──────────────────────────────────────────────────

/**
 * Les feines amb el lease caducat tornen a la cua (o fallen si ja s'han
 * esgotat els intents). El worker ha deixat d'enviar heartbeats: s'ha penjat,
 * s'ha quedat sense xarxa o s'ha apagat. Compta com a intent perquè una cançó
 * que fa petar el worker (p. ex. sense memòria) no el bloquegi indefinidament.
 * Es crida en cada claim i en cada consulta de l'admin: no cal cap temporitzador.
 */
export function expireLeases(): void {
  db.run(sql`
    UPDATE transcription_jobs
    SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'queued' END,
        finished_at = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN datetime('now') ELSE NULL END,
        worker_id = NULL,
        lease_until = NULL,
        started_at = NULL,
        error = 'El worker ha deixat de respondre'
    WHERE status = 'running' AND lease_until < datetime('now')
  `)
}

// ─── Worker: claim / heartbeat / result / fail ───────────────

export interface ClaimedJob {
  id: number
  mode: "new" | "analyze"
  source_url: string
  title: string | null
  artist: string | null
  language: string | null
  lyrics_text: string | null
  song_content: string | null
  lease_seconds: number
}

export function claimJob(
  worker: TranscriptionWorker,
  info: { appVersion: string; device: WorkerDeviceInfo },
): ClaimedJob | null {
  return db.transaction((tx) => {
    tx.update(schema.transcriptionWorkers)
      .set({ lastSeenAt: NOW, appVersion: info.appVersion, deviceInfo: info.device })
      .where(eq(schema.transcriptionWorkers.id, worker.id))
      .run()

    expireLeases()

    const job = tx
      .select()
      .from(schema.transcriptionJobs)
      .where(
        and(
          eq(schema.transcriptionJobs.status, "queued"),
          or(isNull(schema.transcriptionJobs.notBefore), lte(schema.transcriptionJobs.notBefore, NOW)),
        ),
      )
      .orderBy(desc(schema.transcriptionJobs.priority), asc(schema.transcriptionJobs.id))
      .limit(1)
      .get()
    if (!job) return null

    tx.update(schema.transcriptionJobs)
      .set({
        status: "running",
        workerId: worker.id,
        leaseUntil: sql`datetime('now', ${`+${LEASE_SECONDS} seconds`})`,
        startedAt: NOW,
      })
      .where(eq(schema.transcriptionJobs.id, job.id))
      .run()

    let songContent: string | null = null
    if (job.songId) {
      const song = tx
        .select({ content: schema.songs.content })
        .from(schema.songs)
        .where(eq(schema.songs.id, job.songId))
        .get()
      songContent = song?.content ?? null
    }

    return {
      id: job.id,
      mode: job.mode,
      source_url: job.sourceUrl,
      title: job.title,
      artist: job.artist,
      language: job.language,
      lyrics_text: job.lyricsText,
      song_content: songContent,
      lease_seconds: LEASE_SECONDS,
    }
  })
}

/** La feina, si és en curs i d'aquest worker. Si no, el worker l'ha de deixar córrer. */
function ownedRunningJob(workerId: number, jobId: number): TranscriptionJob | null {
  return (
    db
      .select()
      .from(schema.transcriptionJobs)
      .where(
        and(
          eq(schema.transcriptionJobs.id, jobId),
          eq(schema.transcriptionJobs.workerId, workerId),
          eq(schema.transcriptionJobs.status, "running"),
        ),
      )
      .get() ?? null
  )
}

export function heartbeatJob(workerId: number, jobId: number): boolean {
  const result = db
    .update(schema.transcriptionJobs)
    .set({ leaseUntil: sql`datetime('now', ${`+${LEASE_SECONDS} seconds`})` })
    .where(
      and(
        eq(schema.transcriptionJobs.id, jobId),
        eq(schema.transcriptionJobs.workerId, workerId),
        eq(schema.transcriptionJobs.status, "running"),
      ),
    )
    .run()
  db.update(schema.transcriptionWorkers)
    .set({ lastSeenAt: NOW })
    .where(eq(schema.transcriptionWorkers.id, workerId))
    .run()
  return result.changes > 0
}

export type CompleteResult =
  | { status: "lost" }
  | { status: "duplicate"; songId: number }
  | { status: "ok"; songId: number; proposalId: number | null }

function songMetrics(analysis: AnalysisCompact): { bpm: number | null; timeSignature: string | null } {
  if (!analysis.tempo || analysis.tempo.bpm <= 0) return { bpm: null, timeSignature: null }
  const [n, d] = analysis.tempo.time_signature
  return { bpm: Math.round(analysis.tempo.bpm), timeSignature: `${n}/${d}` }
}

function analysisRow(songId: number, jobId: number, analysis: AnalysisCompact, worker: TranscriptionWorker) {
  return {
    songId,
    jobId,
    youtubeId: analysis.source.youtube_id ?? null,
    durationS: analysis.source.duration_s,
    formatVersion: analysis.v,
    appVersion: worker.appVersion,
    device: analysis.models.device ?? worker.deviceInfo?.type ?? null,
    lyricsSource: analysis.lyrics_source,
    analysis,
    createdAt: NOW,
  }
}

/**
 * Desa el resultat d'una feina. Mode `new`: crea la cançó pendent + proposta
 * de l'usuari "Transcriptor" + anàlisi. Mode `analyze`: només desa (o
 * sobreescriu) l'anàlisi i omple bpm/compàs si la cançó no en té.
 */
export function completeJob(
  worker: TranscriptionWorker,
  jobId: number,
  proposal: ProposalResult,
  analysis: AnalysisCompact,
): CompleteResult {
  const job = ownedRunningJob(worker.id, jobId)
  if (!job) return { status: "lost" }

  const metrics = songMetrics(analysis)
  const finish = {
    status: "done" as const,
    leaseUntil: null,
    error: null,
    finishedAt: NOW,
    elapsedSeconds: sql`round((julianday('now') - julianday(${schema.transcriptionJobs.startedAt})) * 86400, 1)`,
  }

  let songId: number
  let proposalId: number | null = null

  if (job.mode === "analyze") {
    if (!job.songId) throw new Error(`Feina ${job.id} en mode analyze sense cançó`)
    songId = job.songId
    db.transaction((tx) => {
      const row = analysisRow(songId, job.id, analysis, worker)
      tx.insert(schema.songAnalyses)
        .values(row)
        .onConflictDoUpdate({ target: schema.songAnalyses.songId, set: row })
        .run()
      if (metrics.bpm !== null) {
        tx.update(schema.songs)
          .set({ bpm: metrics.bpm })
          .where(and(eq(schema.songs.id, songId), isNull(schema.songs.bpm)))
          .run()
        tx.update(schema.songs)
          .set({ timeSignature: metrics.timeSignature })
          .where(and(eq(schema.songs.id, songId), isNull(schema.songs.timeSignature)))
          .run()
      }
      tx.update(schema.transcriptionJobs)
        .set({ ...finish, resultSongId: songId })
        .where(eq(schema.transcriptionJobs.id, job.id))
        .run()
    })
  } else {
    const title = job.title?.trim() || proposal.title.trim()
    const artist = job.artist?.trim() || proposal.artist.trim()
    const dup = findExistingSongByArtistTitle(artist, title)
    if (dup) {
      db.update(schema.transcriptionJobs)
        .set({ status: "failed", leaseUntil: null, finishedAt: NOW, error: `Ja existeix (cançó ${dup.id})` })
        .where(eq(schema.transcriptionJobs.id, job.id))
        .run()
      return { status: "duplicate", songId: dup.id }
    }

    // Fora de la transacció, com a createBulkProposal (vegeu PROJECT_CONTEXT §14)
    const { artistSlug, songSlug } = generateSlugsForNewSong(artist, title)
    const transcriberUserId = getOrCreateTranscriberUser()
    const content = cleanupContent(normalizeSectionTitles(proposal.content))

    let newSongId!: number
    db.transaction((tx) => {
      const songResult = tx
        .insert(schema.songs)
        .values({
          title,
          artist,
          artistSlug,
          songSlug,
          key: proposal.key,
          capo: proposal.capo,
          content,
          language: job.language || proposal.language || "ca",
          tags: proposal.tags,
          youtubeUrl: job.sourceUrl,
          bpm: metrics.bpm,
          timeSignature: metrics.timeSignature,
          state: 2, // pendent
        })
        .run()
      newSongId = Number(songResult.lastInsertRowid)

      const proposalResult = tx
        .insert(schema.songProposals)
        .values({ userId: transcriberUserId, songId: newSongId })
        .run()
      proposalId = Number(proposalResult.lastInsertRowid)

      tx.insert(schema.songAnalyses).values(analysisRow(newSongId, job.id, analysis, worker)).run()
      tx.update(schema.transcriptionJobs)
        .set({ ...finish, resultSongId: newSongId })
        .where(eq(schema.transcriptionJobs.id, job.id))
        .run()
    })
    songId = newSongId
  }

  // Estadístiques del worker (mitjana incremental del temps per cançó)
  const done = db
    .select({ elapsed: schema.transcriptionJobs.elapsedSeconds })
    .from(schema.transcriptionJobs)
    .where(eq(schema.transcriptionJobs.id, job.id))
    .get()
  const elapsed = done?.elapsed ?? null
  const n = worker.jobsDone + 1
  const avg =
    elapsed === null ? worker.avgSeconds : (worker.avgSeconds ?? elapsed) + (elapsed - (worker.avgSeconds ?? elapsed)) / n
  db.update(schema.transcriptionWorkers)
    .set({ jobsDone: n, avgSeconds: avg, lastSeenAt: NOW })
    .where(eq(schema.transcriptionWorkers.id, worker.id))
    .run()

  return { status: "ok", songId, proposalId }
}

/**
 * Fallada d'una feina. `released`: el worker s'ha aturat a mitja feina; torna
 * a la cua sense comptar com a intent. `permanent` (p. ex. vídeo no
 * disponible): no es reintenta. Altrament es reintenta més tard, fins a
 * MAX_ATTEMPTS intents.
 */
export function failJob(
  workerId: number,
  jobId: number,
  body: { error: string; released: boolean; kind: "permanent" | "temporary" },
): boolean {
  const job = ownedRunningJob(workerId, jobId)
  if (!job) return false

  if (body.released) {
    db.update(schema.transcriptionJobs)
      .set({ status: "queued", workerId: null, leaseUntil: null, startedAt: null })
      .where(eq(schema.transcriptionJobs.id, jobId))
      .run()
    return true
  }

  const attempts = job.attempts + 1
  const final = body.kind === "permanent" || attempts >= MAX_ATTEMPTS
  const wait = RETRY_BASE_SECONDS * 2 ** (attempts - 1)
  db.update(schema.transcriptionJobs)
    .set({
      attempts,
      error: body.error,
      workerId: final ? job.workerId : null,
      leaseUntil: null,
      ...(final
        ? { status: "failed" as const, finishedAt: NOW }
        : { status: "queued" as const, startedAt: null, notBefore: sql`datetime('now', ${`+${wait} seconds`})` }),
    })
    .where(eq(schema.transcriptionJobs.id, jobId))
    .run()
  return true
}

// ─── Admin: encuar ──────────────────────────────────────────

export type EnqueueOutcome =
  | { index: number; status: "queued"; id: number }
  | { index: number; status: "duplicate" | "error"; error: string }

function hasActiveJobForSong(songId: number): boolean {
  return !!db
    .select({ id: schema.transcriptionJobs.id })
    .from(schema.transcriptionJobs)
    .where(
      and(eq(schema.transcriptionJobs.songId, songId), inArray(schema.transcriptionJobs.status, ACTIVE_STATUSES)),
    )
    .get()
}

function findJobForVideo(videoId: string): TranscriptionJob | null {
  // Poques feines actives: es filtren en memòria per id de vídeo (les URL poden variar)
  const rows = db
    .select()
    .from(schema.transcriptionJobs)
    .where(
      and(
        eq(schema.transcriptionJobs.mode, "new"),
        or(
          inArray(schema.transcriptionJobs.status, ACTIVE_STATUSES),
          and(eq(schema.transcriptionJobs.status, "done"), isNotNull(schema.transcriptionJobs.resultSongId)),
        ),
      ),
    )
    .all()
  return rows.find((r) => youtubeVideoId(r.sourceUrl) === videoId) ?? null
}

export function enqueueJobs(jobs: EnqueueJob[], priority: number, userId: number): EnqueueOutcome[] {
  return jobs.map((j, index): EnqueueOutcome => {
    if (j.mode === "analyze") {
      if (!j.song_id) return { index, status: "error", error: "Falta la cançó" }
      const song = db
        .select({ id: schema.songs.id, title: schema.songs.title, artist: schema.songs.artist,
                  language: schema.songs.language, youtubeUrl: schema.songs.youtubeUrl })
        .from(schema.songs)
        .where(eq(schema.songs.id, j.song_id))
        .get()
      if (!song) return { index, status: "error", error: "Cançó no trobada" }
      const sourceUrl = j.source_url ?? song.youtubeUrl
      if (!sourceUrl || !youtubeVideoId(sourceUrl)) {
        return { index, status: "error", error: "La cançó no té cap vídeo de YouTube" }
      }
      if (hasActiveJobForSong(song.id)) {
        return { index, status: "duplicate", error: "Ja és a la cua" }
      }
      const r = db
        .insert(schema.transcriptionJobs)
        .values({
          mode: "analyze",
          sourceUrl,
          title: song.title,
          artist: song.artist,
          language: j.language ?? song.language,
          lyricsText: j.lyrics_text ?? null,
          songId: song.id,
          priority,
          createdBy: userId,
        })
        .run()
      return { index, status: "queued", id: Number(r.lastInsertRowid) }
    }

    if (!j.source_url) return { index, status: "error", error: "Falta l'enllaç de YouTube" }
    const videoId = youtubeVideoId(j.source_url)
    if (!videoId) return { index, status: "error", error: "URL de YouTube no vàlida" }
    if (j.title && j.artist) {
      const dup = findExistingSongByArtistTitle(j.artist, j.title)
      if (dup) return { index, status: "duplicate", error: `Ja existeix (cançó ${dup.id})` }
    }
    const previous = findJobForVideo(videoId)
    if (previous) return { index, status: "duplicate", error: `Aquest vídeo ja té una feina (${previous.id})` }

    const r = db
      .insert(schema.transcriptionJobs)
      .values({
        mode: "new",
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: j.title || null,
        artist: j.artist || null,
        language: j.language || null,
        lyricsText: j.lyrics_text || null,
        priority,
        createdBy: userId,
      })
      .run()
    return { index, status: "queued", id: Number(r.lastInsertRowid) }
  })
}

/** Encua `analyze` per a les cançons públiques amb YouTube que no tenen anàlisi ni feina activa. */
export function enqueueAnalyzeMissing(priority: number, userId: number): number {
  const analysed = db.select({ id: schema.songAnalyses.songId }).from(schema.songAnalyses)
  const active = db
    .select({ id: schema.transcriptionJobs.songId })
    .from(schema.transcriptionJobs)
    .where(
      and(isNotNull(schema.transcriptionJobs.songId), inArray(schema.transcriptionJobs.status, ACTIVE_STATUSES)),
    )
  const songs = db
    .select({ id: schema.songs.id })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.youtubeUrl),
        ne(schema.songs.youtubeUrl, ""),
        notInArray(schema.songs.id, analysed),
        notInArray(schema.songs.id, active),
      ),
    )
    .orderBy(asc(schema.songs.id))
    .all()
  const outcomes = enqueueJobs(
    songs.map((s) => ({ mode: "analyze", song_id: s.id })),
    priority,
    userId,
  )
  return outcomes.filter((o) => o.status === "queued").length
}

// ─── Admin: consulta i accions ───────────────────────────────

const LIST_FINISHED_LIMIT = 200

export function listJobs() {
  expireLeases()
  const cols = {
    id: schema.transcriptionJobs.id,
    mode: schema.transcriptionJobs.mode,
    sourceUrl: schema.transcriptionJobs.sourceUrl,
    title: schema.transcriptionJobs.title,
    artist: schema.transcriptionJobs.artist,
    songId: schema.transcriptionJobs.songId,
    status: schema.transcriptionJobs.status,
    priority: schema.transcriptionJobs.priority,
    workerName: schema.transcriptionWorkers.name,
    attempts: schema.transcriptionJobs.attempts,
    notBefore: schema.transcriptionJobs.notBefore,
    error: schema.transcriptionJobs.error,
    resultSongId: schema.transcriptionJobs.resultSongId,
    resultProposalId: sql<number | null>`(SELECT id FROM song_proposals WHERE song_id = ${schema.transcriptionJobs.resultSongId} ORDER BY id DESC LIMIT 1)`,
    elapsedSeconds: schema.transcriptionJobs.elapsedSeconds,
    createdAt: schema.transcriptionJobs.createdAt,
    startedAt: schema.transcriptionJobs.startedAt,
    finishedAt: schema.transcriptionJobs.finishedAt,
  }
  const base = () =>
    db
      .select(cols)
      .from(schema.transcriptionJobs)
      .leftJoin(schema.transcriptionWorkers, eq(schema.transcriptionJobs.workerId, schema.transcriptionWorkers.id))
  const active = base()
    .where(inArray(schema.transcriptionJobs.status, ACTIVE_STATUSES))
    .orderBy(desc(schema.transcriptionJobs.priority), asc(schema.transcriptionJobs.id))
    .all()
  const finished = base()
    .where(notInArray(schema.transcriptionJobs.status, ACTIVE_STATUSES))
    .orderBy(desc(schema.transcriptionJobs.finishedAt), desc(schema.transcriptionJobs.id))
    .limit(LIST_FINISHED_LIMIT)
    .all()
  return [...active, ...finished].map((j) => ({
    id: j.id,
    mode: j.mode,
    source_url: j.sourceUrl,
    title: j.title,
    artist: j.artist,
    song_id: j.songId,
    status: j.status,
    priority: j.priority,
    worker_name: j.workerName,
    attempts: j.attempts,
    not_before: j.notBefore,
    error: j.error,
    result_song_id: j.resultSongId,
    result_proposal_id: j.mode === "new" ? j.resultProposalId : null,
    elapsed_seconds: j.elapsedSeconds,
    created_at: j.createdAt,
    started_at: j.startedAt,
    finished_at: j.finishedAt,
  }))
}

export function countJobsByStatus(): Record<string, number> {
  const rows = db
    .select({ status: schema.transcriptionJobs.status, n: sql<number>`count(*)` })
    .from(schema.transcriptionJobs)
    .groupBy(schema.transcriptionJobs.status)
    .all()
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

/** `cancel`: una feina en cua o en curs (el worker ho veurà al següent heartbeat). `retry`: torna a la cua. */
export function jobAction(id: number, action: "cancel" | "retry"): boolean {
  if (action === "cancel") {
    const r = db
      .update(schema.transcriptionJobs)
      .set({ status: "cancelled", leaseUntil: null, finishedAt: NOW })
      .where(and(eq(schema.transcriptionJobs.id, id), inArray(schema.transcriptionJobs.status, ACTIVE_STATUSES)))
      .run()
    return r.changes > 0
  }
  const r = db
    .update(schema.transcriptionJobs)
    .set({
      status: "queued",
      attempts: 0,
      notBefore: null,
      error: null,
      workerId: null,
      startedAt: null,
      finishedAt: null,
      elapsedSeconds: null,
    })
    .where(
      and(eq(schema.transcriptionJobs.id, id), inArray(schema.transcriptionJobs.status, ["failed", "cancelled"])),
    )
    .run()
  return r.changes > 0
}

// ─── Admin: workers ─────────────────────────────────────────

export function listWorkers() {
  return db
    .select()
    .from(schema.transcriptionWorkers)
    .orderBy(asc(schema.transcriptionWorkers.id))
    .all()
    .map((w) => ({
      id: w.id,
      name: w.name,
      active: !!w.active,
      device_info: w.deviceInfo,
      app_version: w.appVersion,
      last_seen_at: w.lastSeenAt,
      jobs_done: w.jobsDone,
      avg_seconds: w.avgSeconds,
      created_at: w.createdAt,
    }))
}

/** Crea un worker i en retorna el token. És l'únic moment en què es pot veure. */
export function createWorker(name: string, userId: number): { id: number; token: string } {
  const token = generateWorkerToken()
  const r = db
    .insert(schema.transcriptionWorkers)
    .values({ name, tokenHash: hashWorkerToken(token), createdBy: userId })
    .run()
  return { id: Number(r.lastInsertRowid), token }
}

export function setWorkerActive(id: number, active: boolean): boolean {
  const r = db
    .update(schema.transcriptionWorkers)
    .set({ active: active ? 1 : 0 })
    .where(eq(schema.transcriptionWorkers.id, id))
    .run()
  return r.changes > 0
}

export function deleteWorker(id: number): boolean {
  // Les feines en curs d'aquest worker tornen a la cua
  db.update(schema.transcriptionJobs)
    .set({ status: "queued", workerId: null, leaseUntil: null, startedAt: null })
    .where(and(eq(schema.transcriptionJobs.workerId, id), eq(schema.transcriptionJobs.status, "running")))
    .run()
  const r = db.delete(schema.transcriptionWorkers).where(eq(schema.transcriptionWorkers.id, id)).run()
  return r.changes > 0
}

// ─── Anàlisi d'una cançó ────────────────────────────────────

/**
 * Anàlisi vigent d'una cançó, o null. Si el youtubeUrl de la cançó ha canviat
 * des que es va fer, l'anàlisi és d'un altre àudio i no es retorna.
 */
export function getCurrentSongAnalysis(songId: number) {
  const row = db
    .select({
      analysis: schema.songAnalyses,
      youtubeUrl: schema.songs.youtubeUrl,
    })
    .from(schema.songAnalyses)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.songAnalyses.songId))
    .where(eq(schema.songAnalyses.songId, songId))
    .get()
  if (!row) return null
  const current = row.youtubeUrl ? youtubeVideoId(row.youtubeUrl) : null
  if (row.analysis.youtubeId && current !== row.analysis.youtubeId) return null
  return row.analysis
}
