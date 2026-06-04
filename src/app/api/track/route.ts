import { z } from "zod"
import { enqueueEngagement } from "@/lib/analytics/clientEvents"
// TODO: cridar logEvent quan S3 estigui llest

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TrackBodySchema = z.object({
  type: z.literal("page_engagement"),
  path: z.string().max(500),
  active_ms: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  scroll_pct: z.number().int().min(0).max(100),
  viewport_w: z.number().int().min(0).max(20000).optional(),
  viewport_h: z.number().int().min(0).max(20000).optional(),
})

/**
 * POST /api/track
 *
 * Rep events d'engagement del tracker client-side.
 * Accepta application/json o text/plain (sendBeacon pot enviar text/plain).
 * Sense autenticació: qualsevol pot fer POST; la validació limita el dany.
 * Retorna 204 sense body per a no bloquejar sendBeacon.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? ""

    let rawBody: unknown
    if (contentType.includes("text/plain")) {
      const text = await request.text()
      try {
        rawBody = JSON.parse(text)
      } catch {
        return new Response("Body JSON invàlid", { status: 400 })
      }
    } else {
      try {
        rawBody = await request.json()
      } catch {
        return new Response("Body JSON invàlid", { status: 400 })
      }
    }

    const parsed = TrackBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return new Response("Dades d'event invàlides", { status: 400 })
    }

    const { path, active_ms, scroll_pct, viewport_w, viewport_h } = parsed.data

    enqueueEngagement({
      path,
      active_ms,
      scroll_pct,
      viewport_w,
      viewport_h,
      request,
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error("[POST /api/track]", err)
    return new Response("Error intern del servidor", { status: 500 })
  }
}
