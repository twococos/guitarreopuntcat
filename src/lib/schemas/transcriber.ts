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

export const resultBodySchema = z.object({
  proposal: proposalResultSchema,
  analysis: analysisCompactSchema,
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
})

export type EnqueueJob = z.infer<typeof enqueueJobSchema>

export const enqueueBodySchema = z.union([
  z.object({ jobs: z.array(enqueueJobSchema).min(1).max(1000), priority: z.number().int().default(0) }),
  // Encua el mode `analyze` per a totes les cançons públiques amb YouTube i sense anàlisi
  z.object({ analyzeMissing: z.literal(true), priority: z.number().int().default(0) }),
])

export const jobActionSchema = z.object({ action: z.enum(["cancel", "retry"]) })

export const createWorkerSchema = z.object({ name: z.string().trim().min(1).max(100) })
export const updateWorkerSchema = z.object({ active: z.boolean() })
