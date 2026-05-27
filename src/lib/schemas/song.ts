import { z } from "zod"

export const songInputSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  key: z.string().min(1),
  capo: z.number().int().default(0),
  content: z.string().min(1),
  language: z.string().default("ca"),
  tags: z.string().default(""),
  album: z.string().max(200).nullable().optional(),
  year: z.number().int().min(1000).max(2100).nullable().optional(),
  youtubeUrl: z
    .string()
    .regex(/^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//, "URL de YouTube no vàlida")
    .nullable()
    .optional(),
  spotifyUrl: z
    .string()
    .regex(/^https?:\/\/open\.spotify\.com\//, "URL de Spotify no vàlida")
    .nullable()
    .optional(),
})

export type SongInput = z.infer<typeof songInputSchema>

export const songUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  capo: z.number().int().optional(),
  content: z.string().min(1).optional(),
  language: z.string().optional(),
  tags: z.string().optional(),
  state: z.number().int().optional(),
  album: z.string().max(200).nullable().optional(),
  year: z.number().int().min(1000).max(2100).nullable().optional(),
  youtubeUrl: z
    .string()
    .regex(/^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//, "URL de YouTube no vàlida")
    .nullable()
    .optional(),
  spotifyUrl: z
    .string()
    .regex(/^https?:\/\/open\.spotify\.com\//, "URL de Spotify no vàlida")
    .nullable()
    .optional(),
})

export type SongUpdate = z.infer<typeof songUpdateSchema>

const VALID_SORT_COLS = ["title", "artist", "key", "created_at"] as const
const VALID_ORDERS = ["ASC", "DESC"] as const

export const songQuerySchema = z.object({
  search: z.string().optional(),
  artist: z.string().optional(),
  sortBy: z.enum(VALID_SORT_COLS).default("title"),
  order: z.enum(VALID_ORDERS).default("ASC"),
})

export type SongQuery = z.infer<typeof songQuerySchema>
