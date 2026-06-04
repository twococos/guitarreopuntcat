/**
 * Cerca metadades complementàries per a una llista de files (artista + títol):
 *   - Link de YouTube (scrape de la pàgina de resultats).
 *   - Link de Spotify + àlbum + any (Web API).
 *   - Idioma (detecció via `franc` a partir de artista + títol + àlbum).
 *
 * Només omple camps en blanc — si la fila ja porta un valor, no es toca.
 *
 * Respon amb SSE perquè la cerca pot trigar uns segons per fila:
 *   { type: "meta", spotifyAvailable }
 *   { type: "progress", index, youtubeUrl?, spotifyUrl?, album?, year?, language? }
 *   { type: "done" }
 *
 * Per a cada camp opcional retornat:
 *   `string|number` → trobat
 *   `null`          → "buscat però no trobat"
 *   absent (undef.) → "no s'ha buscat perquè ja tenia valor"
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { findYoutubeUrl } from "@/lib/bulkImport/findYoutube"
import {
  findSpotifyTrack,
  isSpotifyConfigured,
} from "@/lib/bulkImport/findSpotify"
import { detectSongLanguage } from "@/lib/bulkImport/detectLanguage"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const rowSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  hasYoutube: z.boolean(),
  hasSpotify: z.boolean(),
  hasAlbum: z.boolean(),
  hasYear: z.boolean(),
  hasLanguage: z.boolean(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Cos no vàlid." }, { status: 400 })
  }

  const { rows } = parsed.data
  const spotifyAvailable = isSpotifyConfigured()

  logEvent({
    type: "admin_action",
    request: req,
    userId: user.id,
    metadata: { action: "find_links" },
    status: 200,
  })
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send({ type: "meta", spotifyAvailable })

      let lastYtAt = 0
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const willSearchYt = !row.hasYoutube
        // Crida a Spotify si falten camps que pot omplir: link, àlbum o any.
        const willSearchSp =
          spotifyAvailable &&
          (!row.hasSpotify || !row.hasAlbum || !row.hasYear)

        // Throttling YouTube: el scraping ràpid es detecta com a bot. Esperem
        // 800-1500ms aleatoris entre cerques perquè sembli tràfic humà.
        // Només compta si vam fer (i farem) una crida real.
        if (willSearchYt && lastYtAt > 0) {
          const elapsed = Date.now() - lastYtAt
          const wait = 800 + Math.floor(Math.random() * 700)
          if (elapsed < wait) {
            await sleep(wait - elapsed)
          }
        }

        // Llencem les dues cerques en paral·lel per fila per anar més ràpid
        const ytPromise = willSearchYt
          ? findYoutubeUrl(row.artist, row.title).catch(() => null)
          : Promise.resolve(undefined)
        const spPromise = willSearchSp
          ? findSpotifyTrack(row.artist, row.title).catch(() => null)
          : Promise.resolve(undefined)

        const [youtubeUrl, spotifyTrack] = await Promise.all([
          ytPromise,
          spPromise,
        ])

        if (willSearchYt) lastYtAt = Date.now()

        // Desglossem el resultat de Spotify als camps individuals que ens
        // demana el frontend. Per cada un només l'enviem si el feiem servir
        // (la fila no en tenia) — així el frontend distingeix "no buscat"
        // de "buscat i no trobat".
        const event: {
          type: "progress"
          index: number
          youtubeUrl?: string | null
          spotifyUrl?: string | null
          album?: string | null
          year?: number | null
          language?: string | null
        } = {
          type: "progress",
          index: i,
        }
        if (willSearchYt) event.youtubeUrl = youtubeUrl ?? null
        if (willSearchSp) {
          if (!row.hasSpotify) event.spotifyUrl = spotifyTrack?.url ?? null
          if (!row.hasAlbum) event.album = spotifyTrack?.album ?? null
          if (!row.hasYear) event.year = spotifyTrack?.year ?? null
        }

        // Detecció d'idioma: si falta, alimentem franc amb artista + títol
        // + àlbum (si l'acabem de treure de Spotify, sumem més senyal de
        // text — els títols sols són massa curts per a una detecció fiable).
        if (!row.hasLanguage) {
          const albumHint = spotifyTrack?.album ?? null
          const lang = detectSongLanguage(row.artist, row.title, albumHint)
          event.language = lang
        }

        send(event)
      }

      send({ type: "done" })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
