/**
 * API publica per emetre events d'analytics des de Route Handlers i Server Components.
 * Mai async, mai tira — errors capturats internament per no afectar el flux de la peticio.
 */

import type { EventType, EventMetadataMap } from "./types"
import { analyticsQueue } from "./queue"
import { hashIp } from "./ip"

export function logEvent<T extends EventType>(input: {
  type: T
  request?: Request | { headers: Headers; method?: string; url?: string }
  userId?: number | null
  metadata?: EventMetadataMap[T]
  status?: number
  durationMs?: number
}): void {
  try {
    const sid = readSidFromRequest(input.request)
    const ip = readIpFromRequest(input.request)
    const path = readPathFromRequest(input.request)
    const referrer = readReferrerFromRequest(input.request)
    const method = readMethodFromRequest(input.request)

    analyticsQueue.enqueue({
      session_id: sid,
      user_id: input.userId ?? null,
      type: input.type,
      path,
      method,
      status: input.status ?? null,
      ip_hash: hashIp(ip),
      ip_raw: ip,
      referrer,
      metadata: input.metadata,
      duration_ms: input.durationMs ?? null,
      // session_init i ip_bucket nomes els afegeix el middleware al primer page_view
    })
  } catch (e) {
    console.error("[analytics] logEvent failed", e)
  }
}

// ---------------------------------------------------------------------------
// Helpers locals
// ---------------------------------------------------------------------------

function readSidFromRequest(
  req: { headers: Headers } | undefined,
): string {
  if (!req) return "server"
  const cookie = req.headers.get("cookie") ?? ""
  const m = cookie.match(/(?:^|;\s*)__cnc_sid=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : "server"
}

function readIpFromRequest(
  req: { headers: Headers } | undefined,
): string {
  if (!req) return "0.0.0.0"
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "0.0.0.0"
}

function readPathFromRequest(
  req: { headers: Headers; url?: string } | undefined,
): string | null {
  if (!req?.url) return null
  try {
    return new URL(req.url).pathname
  } catch {
    return null
  }
}

function readReferrerFromRequest(
  req: { headers: Headers } | undefined,
): string | null {
  return req?.headers.get("referer") ?? null
}

function readMethodFromRequest(
  req: { method?: string } | undefined,
): string | null {
  return req?.method ?? null
}
