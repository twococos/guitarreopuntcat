/**
 * Middleware de Next.js per a la captura d'events d'analítiques.
 * S'executa en cada request que coincideixi amb el matcher configurat.
 *
 * Requereix `experimental.nodeMiddleware: true` a next.config.mjs per
 * poder usar crypto i better-sqlite3 (API de Node.js, no Edge Runtime).
 */

import { NextResponse, type NextRequest } from "next/server"
import crypto from "node:crypto"
import { analyticsQueue } from "@/lib/analytics/queue"
import { hashIp } from "@/lib/analytics/ip"
import { parseUA } from "@/lib/analytics/ua"
import { detectBot } from "@/lib/analytics/bot"
import { lookupCountry } from "@/lib/analytics/geo"
import { isBlocked } from "@/lib/analytics/blocklist"

export const runtime = "nodejs"

export const config = {
  matcher: [
    // Exclou estàtics de Next, recursos de imatge, favicon, assets, rutes d'auth i track intern
    "/((?!_next/static|_next/image|favicon|assets|api/auth|api/track).*)",
  ],
}

export function middleware(request: NextRequest): NextResponse {
  // ─── 1. Llegeix o crea la cookie de sessió ──────────────────
  let sid = request.cookies.get("__cnc_sid")?.value
  let isNew = false

  if (!sid) {
    sid = crypto.randomUUID()
    isNew = true
  }

  // Si és una cookie nova, l'injectem també als headers del request
  // perquè els Route Handlers i Server Components puguin llegir-la
  // dins el mateix request (la cookie del response només arriba al següent).
  const requestHeaders = new Headers(request.headers)
  if (isNew) {
    const existingCookie = requestHeaders.get("cookie") ?? ""
    const newCookie = existingCookie
      ? `${existingCookie}; __cnc_sid=${sid}`
      : `__cnc_sid=${sid}`
    requestHeaders.set("cookie", newCookie)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (isNew) {
    response.cookies.set("__cnc_sid", sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // 180 dies
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    })
  }

  // ─── 2. Extreu dades de la petició ─────────────────────────
  const xff = request.headers.get("x-forwarded-for")
  const ip =
    xff?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"

  const ua = request.headers.get("user-agent") ?? ""
  const referrer = request.headers.get("referer") ?? null
  const acceptLang = request.headers.get("accept-language") ?? null
  const language =
    acceptLang?.split(",")[0]?.split(";")[0]?.trim() ?? null

  const url = request.nextUrl
  const path = url.pathname

  // Paràmetres UTM
  const utm_source = url.searchParams.get("utm_source") ?? null
  const utm_medium = url.searchParams.get("utm_medium") ?? null
  const utm_campaign = url.searchParams.get("utm_campaign") ?? null
  const utm_term = url.searchParams.get("utm_term") ?? null
  const utm_content = url.searchParams.get("utm_content") ?? null

  // Detecció de bot, parsing de UA i geolocalització
  const { isBot, kind: botKind } = detectBot(ua)
  const parsed = parseUA(ua)
  const country = lookupCountry(ip)
  const ipHash = hashIp(ip)

  // ─── Bloqueig d'IPs ─────────────────────────────────────────
  // Si la IP està a la llista, retornem 403 sense més processament.
  if (isBlocked(ipHash)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  // ─── 3. Encua l'event (fire-and-forget) ────────────────────
  try {
    analyticsQueue.enqueue({
      session_id: sid,
      type: "page_view",
      path,
      method: request.method,
      ip_hash: ipHash,
      ip_raw: ip,
      referrer,
      metadata: {
        title: null,
        query: Object.fromEntries(url.searchParams),
      },
      session_init: isNew
        ? {
            ua_raw: ua || null,
            ua_browser: parsed.browser,
            ua_os: parsed.os,
            // Si és bot, forcem "bot" com a tipus de dispositiu
            ua_device: isBot ? "bot" : parsed.device,
            country,
            is_bot: isBot,
            bot_kind: botKind,
            entry_path: path,
            entry_referrer: referrer,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
            viewport_w: null,
            viewport_h: null,
            language,
          }
        : undefined,
      // Els bots no actualitzen els buckets d'IP (evita falsos positius de ràfega)
      ip_bucket: isBot ? undefined : { country, ip_raw: ip },
    })
  } catch (e) {
    // Mai ha de bloquejar la petició — només registrem l'error
    console.error("[middleware] enqueue failed", e)
  }

  return response
}
