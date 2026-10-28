import { z } from "zod"

/** Pestanya «Importar cançons» de l'admin (src/components/admin/import/). */

export const spotifyTrackSchema = z.object({
  spotify_id: z.string().regex(/^[A-Za-z0-9]{22}$/),
  url: z.string().url().max(300),
  title: z.string().trim().min(1).max(300),
  artists: z.array(z.string().trim().max(300)).max(20),
  album: z.string().max(300).nullable(),
  year: z.number().int().nullable(),
  duration_ms: z.number().int().min(0),
  image_url: z.string().url().max(500).nullable(),
})

export const resolveBodySchema = z.object({ input: z.string().trim().min(1).max(500) })

export const MATCH_BATCH_MAX = 5

export const matchBodySchema = z.object({ tracks: z.array(spotifyTrackSchema).min(1).max(MATCH_BATCH_MAX) })
