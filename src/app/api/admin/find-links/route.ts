/**
 * Cerca links de YouTube i Spotify per a una llista de files (artista + títol).
 * Només omple camps en blanc — si la fila ja porta link, no es toca.
 *
 * Respon amb SSE perquè la cerca pot trigar uns segons per fila:
 *   { type: "progress", index, youtubeUrl?: string|null, spotifyUrl?: string|null }
 *   { type: "done" }
 *
 * `null` significa "buscat però no trobat". `undefined` (omès) significa
 * "no s'ha buscat perquè ja en tenia un".
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { findYoutubeUrl } from "@/lib/bulkImport/findYoutube"
import { findSpotifyUrl, isSpotifyConfigured } from "@/lib/bulkImport/findSpotify"

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
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Cos no vàlid." }, { status: 400 })
  }

  const { rows } = parsed.data
  const spotifyAvailable = isSpotifyConfigured()
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
        const spPromise =
          row.hasSpotify || !spotifyAvailable
            ? Promise.resolve(undefined)
            : findSpotifyUrl(row.artist, row.title).catch(() => null)

        const [youtubeUrl, spotifyUrl] = await Promise.all([ytPromise, spPromise])

        if (willSearchYt) lastYtAt = Date.now()

        send({
          type: "progress",
          index: i,
          youtubeUrl,
          spotifyUrl,
        })
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
