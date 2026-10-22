import { sql } from "drizzle-orm"
import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { PdfOptions } from "@/lib/schemas/canconer"
import type { ReportItem } from "@/lib/schemas/report"
import type { AnalysisCompact, JobStats, WorkerDeviceInfo } from "@/lib/schemas/transcriber"
import type { SyncQuality } from "@/lib/transcriber/sync"

// ─── Cançons ────────────────────────────────────────────────
export const songs = sqliteTable(
  "songs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    // Slugs URL-safe per a les rutes públiques /songs/[artist]/[song].
    // Generats al moment de creació i mai re-generats automàticament
    // encara que canviï `title` o `artist` (evitem trencar enllaços externs).
    // `artistSlug` és únic globalment per artista (totes les cançons del
    // mateix artista comparteixen el mateix slug).
    artistSlug: text("artist_slug"),
    songSlug: text("song_slug"),
    key: text("key").notNull(),
    capo: integer("capo").default(0),
    content: text("content").notNull(),
    language: text("language").default("ca"),
    tags: text("tags").default(""),
    album: text("album"),
    year: integer("year"),
    youtubeUrl: text("youtube_url"),
    spotifyUrl: text("spotify_url"),
    // Tempo i compàs. Els omple el transcriptor (si són buits) i es poden corregir a mà.
    bpm: integer("bpm"),
    timeSignature: text("time_signature"), // "4/4", "3/4", "6/8"
    // Estil d'acompanyament fixat per l'admin (STYLE_IDS de src/lib/player/styles.ts).
    // Null = el que detecta el transcriptor (song_analyses) o el per defecte.
    rhythm: text("rhythm"),
    state: integer("state").notNull().default(0),
    // 0 pública, 1 privada, 2 proposta pendent. Qui la pot veure: src/lib/access/songs.ts
    // Propietari de les privades i de les propostes. Null a les públiques (són de tothom).
    ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
    // Privada + original = arranjament d'una cançó pública. Si s'esborra
    // l'original, l'arranjament queda com a privada normal.
    originalSongId: integer("original_song_id").references((): AnySQLiteColumn => songs.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    slugUnique: uniqueIndex("songs_artist_song_slug_unique").on(t.artistSlug, t.songSlug),
    stateIdx: index("songs_state_idx").on(t.state),
    ownerIdx: index("songs_owner_idx").on(t.ownerId, t.state),
    originalIdx: index("songs_original_idx").on(t.originalSongId),
  }),
)

// ─── Usuaris ────────────────────────────────────────────────
// Nota: el camp `googleId` es manté per compatibilitat amb dades
// existents. NextAuth identifica via la taula `accounts`.
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    googleId: text("google_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    googleName: text("google_name"),
    avatarUrl: text("avatar_url"),
    role: text("role", { enum: ["user", "admin"] }).default("user"),
    active: integer("active").default(1),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    googleIdUnique: uniqueIndex("users_google_id_unique").on(t.googleId),
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
  }),
)

// ─── Cançoners ──────────────────────────────────────────────
export const canconers = sqliteTable(
  "canconers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("El meu cançoner"),
    shareToken: text("share_token"),
    style: text("style").notNull().default("classic"),
    accentColor: text("accent_color"),
    pdfOptions: text("pdf_options", { mode: "json" }).$type<PdfOptions>(),
    // 0 privat, 1 públic (cercable i a /songbooks/[id]/[slug]). El share_token
    // és independent: dona accés per enllaç encara que sigui privat.
    visibility: integer("visibility").notNull().default(0),
    // Derivat del títol en publicar. No és únic: la URL porta l'id.
    slug: text("slug"),
    publishedAt: text("published_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    shareTokenUnique: uniqueIndex("canconers_share_token_unique").on(t.shareToken),
    visibilityIdx: index("canconers_visibility_idx").on(t.visibility, t.publishedAt),
  }),
)

// ─── Cançons d'un cançoner ──────────────────────────────────
export const canconerSongs = sqliteTable("canconer_songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  canconerId: integer("canconer_id")
    .notNull()
    .references(() => canconers.id, { onDelete: "cascade" }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  semitones: integer("semitones").default(0),
  position: integer("position").notNull().default(0),
})

// ─── Propostes de cançons ───────────────────────────────────
export const songProposals = sqliteTable("song_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "cancelled"],
  }).default("pending"),
  reviewerId: integer("reviewer_id").references(() => users.id),
  notes: text("notes").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  reviewedAt: text("reviewed_at"),
  resubmittedAt: text("resubmitted_at"),
})

// ─── Transcripció automàtica (worker extern, vegeu src/lib/transcriber/) ──
// Workers autoritzats a demanar feina. Autenticació per token (només se'n desa
// el SHA-256), a part de NextAuth.
export const transcriptionWorkers = sqliteTable(
  "transcription_workers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    active: integer("active").notNull().default(1),
    deviceInfo: text("device_info", { mode: "json" }).$type<WorkerDeviceInfo>(),
    appVersion: text("app_version"),
    lastSeenAt: text("last_seen_at"),
    jobsDone: integer("jobs_done").notNull().default(0),
    avgSeconds: real("avg_seconds"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("transcription_workers_token_hash_unique").on(t.tokenHash),
  }),
)

// Cua de feines. `new`: crea una proposta. `analyze`: només desa l'anàlisi
// d'una cançó existent (`songId`), sense tocar-ne el content.
export const transcriptionJobs = sqliteTable(
  "transcription_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mode: text("mode", { enum: ["new", "analyze"] }).notNull().default("new"),
    sourceUrl: text("source_url").notNull(),
    title: text("title"),
    artist: text("artist"),
    language: text("language"),
    lyricsText: text("lyrics_text"),
    songId: integer("song_id").references(() => songs.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "done", "failed", "cancelled"] })
      .notNull()
      .default("queued"),
    priority: integer("priority").notNull().default(0),
    workerId: integer("worker_id").references(() => transcriptionWorkers.id, { onDelete: "set null" }),
    leaseUntil: text("lease_until"),
    attempts: integer("attempts").notNull().default(0),
    notBefore: text("not_before"), // no es reintenta abans d'aquesta data
    error: text("error"),
    resultSongId: integer("result_song_id").references(() => songs.id, { onDelete: "set null" }),
    elapsedSeconds: real("elapsed_seconds"),
    // Com s'ha fet la feina (temps per etapa, dispositiu, confiances…). JSON
    // obert: el worker hi pot afegir camps nous sense migració.
    stats: text("stats", { mode: "json" }).$type<JobStats>(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => ({
    statusIdx: index("transcription_jobs_status_idx").on(t.status, t.priority, t.id),
    workerIdx: index("transcription_jobs_worker_idx").on(t.workerId, t.status, t.finishedAt),
  }),
)

// Última anàlisi de cada cançó (se sobreescriu en reprocessar). És la sortida
// de la màquina i no s'edita mai: la sincronització amb el content es calcula
// al moment. Si el youtubeUrl de la cançó ja no coincideix amb `youtubeId`,
// l'anàlisi és d'un altre àudio i no s'ha de fer servir.
export const songAnalyses = sqliteTable("song_analyses", {
  songId: integer("song_id")
    .primaryKey()
    .references(() => songs.id, { onDelete: "cascade" }),
  jobId: integer("job_id").references(() => transcriptionJobs.id, { onDelete: "set null" }),
  youtubeId: text("youtube_id"),
  durationS: real("duration_s").notNull(),
  formatVersion: integer("format_version").notNull(),
  appVersion: text("app_version"),
  device: text("device"),
  lyricsSource: text("lyrics_source"),
  analysis: text("analysis", { mode: "json" }).$type<AnalysisCompact>().notNull(),
  // Memòria cau de la qualitat de la sincronització amb el content (per a
  // llistes). `syncHash` és el hash del content + capo amb què es va calcular:
  // si no coincideix, cal recalcular-la (src/db/queries/transcriptions.ts).
  syncQuality: text("sync_quality", { mode: "json" }).$type<SyncQuality>(),
  syncHash: text("sync_hash"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
})

// ─── Reports d'errors de les cançons (vegeu src/lib/reports/) ──
// Un report és un enviament d'un visitant (amb sessió o sense); els ítems són
// les correccions concretes, que l'admin aplica o rebutja d'una en una.
export const songReports = sqliteTable(
  "song_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    // Antispam: hash de la cookie de sessió d'analítiques i de la IP (mai en clar)
    sessionHash: text("session_hash"),
    ipHash: text("ip_hash"),
    contentHash: text("content_hash").notNull(), // del content que veia l'usuari
    semitones: integer("semitones").notNull().default(0),
    source: text("source", { enum: ["song", "songbook", "share"] }).notNull().default("song"),
    canconerId: integer("canconer_id").references(() => canconers.id, { onDelete: "set null" }),
    comment: text("comment").notNull().default(""),
    status: text("status", { enum: ["pending", "resolved"] }).notNull().default("pending"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    songIdx: index("song_reports_song_idx").on(t.songId, t.status),
    sessionIdx: index("song_reports_session_idx").on(t.sessionHash, t.createdAt),
    ipIdx: index("song_reports_ip_idx").on(t.ipHash, t.createdAt),
  }),
)

export const songReportItems = sqliteTable(
  "song_report_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reportId: integer("report_id")
      .notNull()
      .references(() => songReports.id, { onDelete: "cascade" }),
    category: text("category", { enum: ["chords", "lyrics", "sections", "other"] }).notNull(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" }).$type<ReportItem>().notNull(),
    // Mateix lloc i mateixa correcció → mateixa clau («×N persones»)
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status", { enum: ["pending", "applied", "rejected"] }).notNull().default("pending"),
    reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: text("reviewed_at"),
  },
  (t) => ({
    reportIdx: index("song_report_items_report_idx").on(t.reportId),
    dedupeIdx: index("song_report_items_dedupe_idx").on(t.dedupeKey, t.status),
  }),
)

// ─── Tipus inferits ─────────────────────────────────────────
export type Song = typeof songs.$inferSelect
export type SongInsert = typeof songs.$inferInsert
export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
export type Canconer = typeof canconers.$inferSelect
export type CanconerInsert = typeof canconers.$inferInsert
export type CanconerSong = typeof canconerSongs.$inferSelect
export type CanconerSongInsert = typeof canconerSongs.$inferInsert
export type SongProposal = typeof songProposals.$inferSelect
export type SongProposalInsert = typeof songProposals.$inferInsert
export type TranscriptionWorker = typeof transcriptionWorkers.$inferSelect
export type TranscriptionJob = typeof transcriptionJobs.$inferSelect
export type SongAnalysis = typeof songAnalyses.$inferSelect
export type SongReport = typeof songReports.$inferSelect
export type SongReportItem = typeof songReportItems.$inferSelect
