import { z } from "zod"

export const songInputSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  key: z.string().min(1),
  capo: z.number().int().default(0),
  content: z.string().min(1),
  language: z.string().default("ca"),
  tags: z.string().default(""),
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
  draft: z.number().int().optional(),
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
