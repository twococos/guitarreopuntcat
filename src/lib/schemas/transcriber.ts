import { z } from "zod"

// ─── Protocol worker ↔ canconer (vegeu docs/api_worker.md del repo transcriptor) ──

export const workerDeviceInfoSchema = z.object({
  type: z.enum(["cpu", "cuda"]),
  name: z.string().max(200),
  vram_gb: z.number().nonnegative().default(0),
  hostname: z.string().max(200).optional(),
})

export type WorkerDeviceInfo = z.infer<typeof workerDeviceInfoSchema>

export const claimBodySchema = z.object({
  worker: z.string().max(200),
  app_version: z.string().max(50),
  device: workerDeviceInfoSchema,
})

export const failBodySchema = z.object({
  error: z.string().max(4000),
  released: z.boolean().default(false),
  kind: z.enum(["permanent", "temporary"]).default("temporary"),
})

// ─── Anàlisi en format compacte (v2) ──────────────────────────
// Mateixa informació que `SongAnalysis` del transcriptor (src/transcriptor/schema.py),
// amb tuples i temps en ms enters. El detall de cada camp és a `a_compacte()`.

const ms = z.number().int().nonnegative()
const conf = z.number().min(0).max(1)

export const analysisCompactSchema = z.object({
  v: z.literal(2),
  source: z.object({
    url: z.string().optional(),
    youtube_id: z.string().optional(),
    fitxer: z.string().optional(),
    duration_s: z.number().positive(),
  }),
  meta: z.object({ title: z.string(), artist: z.string(), language: z.string() }),
  key: z
    .object({ tonic: z.string(), mode: z.enum(["major", "minor"]), confidence: z.number() })
    .nullable(),
  capo: z.number().int().min(0).max(11),
  tempo: z
    .object({
      bpm: z.number().nonnegative(),
      time_signature: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    })
    .nullable(),
  beats: z.object({
    dt: z.array(ms),
    downbeats: z.array(z.number().int().nonnegative()),
    beat_exceptions: z.record(z.string(), z.number().int().positive()).optional(),
  }),
  // [start_ms, end_ms, label, conf, índex de pulsació | null, raw?]
  chords: z.array(
    z.union([
      z.tuple([ms, ms, z.string(), conf, z.number().int().nonnegative().nullable()]),
      z.tuple([ms, ms, z.string(), conf, z.number().int().nonnegative().nullable(), z.string()]),
    ]),
  ),
  // [start_ms, end_ms, text, conf | null]
  words: z.array(z.tuple([ms, ms, z.string(), conf.nullable()])),
  // [start_ms, end_ms, paraula_inici, paraula_fi, secció | null]
  lines: z.array(
    z.tuple([ms, ms, z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nullable()]),
  ),
  // [start_ms, end_ms, label, name]
  sections: z.array(z.tuple([ms, ms, z.string(), z.string()])),
  lyrics_source: z.enum(["user", "db", "lrclib", "whisper", "cap"]),
  models: z.record(z.string(), z.string()),
  stage_times_s: z.record(z.string(), z.number()).default({}),
  warnings: z.array(z.string()).default([]),
  // Estil rítmic detectat (opcional: els workers antics no l'envien). `style` és un dels
  // STYLE_IDS de src/lib/player/styles.ts; un de desconegut s'ignora en reproduir.
  rhythm: z
    .object({
      style: z.string().max(40),
      confidence: z.number().min(0).max(1),
      alternatives: z.array(z.tuple([z.string().max(40), z.number().min(0).max(1)])).max(5).default([]),
      // Empremta de groove: una fila de compàs per banda (greus, mitjos, aguts), valors 0-1
      groove: z
        .object({
          slots_per_beat: z.number().int().positive().max(8),
          low: z.array(z.number().min(0).max(1)).max(64),
          mid: z.array(z.number().min(0).max(1)).max(64),
          high: z.array(z.number().min(0).max(1)).max(64),
        })
        .optional(),
      arpeggiated: z.number().min(0).max(1).optional(),
    })
    .optional(),
})

export type AnalysisCompact = z.infer<typeof analysisCompactSchema>

// Mateixa forma que `ImportResult` (src/lib/importers/types.ts)
export const proposalResultSchema = z.object({
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  key: z.string().min(1).max(10),
  capo: z.number().int().min(0).max(11),
  language: z.string().max(10),
  tags: z.string().max(500).default(""),
  content: z.string().min(1),
  youtubeUrl: z.string().nullable().optional(),
})

// ─── Estadístiques de la feina ─────────────────────────────────
// Com s'ha fet (no què hi ha a l'àudio, que és l'anàlisi): temps per etapa,
// dispositiu, font de la lletra, confiances… Només es validen els camps que fa
// servir el servidor (classificacions); la resta passa tal qual perquè el worker
// hi pugui afegir dades noves sense migracions. Detall a docs/api_worker.md.

const MAX_STATS_BYTES = 32 * 1024

export const jobStatsSchema = z
  .object({
    v: z.number().int().positive(),
    audio: z.object({ duration_s: z.number().positive() }).passthrough().optional(),
    timing: z
      .object({
        total_s: z.number().nonnegative(),
        cached: z.array(z.string()).default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine((s) => JSON.stringify(s).length <= MAX_STATS_BYTES, {
    message: `Les estadístiques no poden passar de ${MAX_STATS_BYTES / 1024} KB`,
  })

export type JobStats = z.infer<typeof jobStatsSchema>

export const resultBodySchema = z.object({
  proposal: proposalResultSchema,
  analysis: analysisCompactSchema,
  stats: jobStatsSchema.optional(),
})

// ─── Admin ─────────────────────────────────────────────────────

const YOUTUBE_RE = /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//

export const enqueueJobSchema = z.object({
  mode: z.enum(["new", "analyze"]).default("new"),
  source_url: z.string().regex(YOUTUBE_RE, "URL de YouTube no vàlida").optional(),
  title: z.string().trim().max(300).optional(),
  artist: z.string().trim().max(300).optional(),
  language: z.string().max(10).optional(),
  lyrics_text: z.string().max(20000).optional(),
  song_id: z.number().int().positive().optional(),
  // Metadades de Spotify (pestanya «Importar cançons»)
  spotify_url: z.string().url().max(300).optional(),
  album: z.string().trim().max(300).optional(),
  year: z.number().int().min(1000).max(2100).optional(),
  duration_s: z.number().positive().max(36000).optional(),
})

export type EnqueueJob = z.infer<typeof enqueueJobSchema>

export const enqueueBodySchema = z.union([
  z.object({ jobs: z.array(enqueueJobSchema).min(1).max(1000), priority: z.number().int().default(0) }),
  // Encua el mode `analyze` per a totes les cançons públiques amb YouTube i sense anàlisi
  // (`true`), o amb una anàlisi sense l'estil rítmic (`"rhythm"`)
  z.object({ analyzeMissing: z.union([z.literal(true), z.literal("rhythm")]), priority: z.number().int().default(0) }),
])

export const jobActionSchema = z.object({ action: z.enum(["cancel", "retry", "top"]) })

export const queueSettingsSchema = z.union([
  z.object({ queue_order: z.enum(["fifo", "lifo"]) }),
  z.object({ cancel_queued: z.literal(true) }),
])

export const finishedQuerySchema = z.object({
  status: z.enum(["done", "failed", "cancelled"]).optional(),
  worker: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
})

export const createWorkerSchema = z.object({ name: z.string().trim().min(1).max(100) })
export const updateWorkerSchema = z.object({ active: z.boolean() })
