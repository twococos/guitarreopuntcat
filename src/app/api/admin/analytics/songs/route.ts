import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import {
  getTopSongs,
  getCategoryAggregate,
  getCategoryTimeseries,
} from "@/db/queries/analytics/pages"
import { parseDateRange, parseLimit } from "../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { searchParams } = new URL(request.url)

    const dateRange = parseDateRange(searchParams)
    if (dateRange instanceof NextResponse) return dateRange
    const { from, to } = dateRange

    const limit = parseLimit(searchParams, 20, 50)
    if (limit instanceof NextResponse) return limit

    const songs = await getTopSongs(from, to, limit)
    const aggregate = await getCategoryAggregate("song", from, to)

    // Sèrie temporal només per als top N (paths). Pots descobrir-los del
    // resultat de getTopSongs. Limitem a top 8 per a no saturar la gràfica.
    const topPaths = songs
      .slice(0, 8)
      .map((s) => `/songs/${s.artist_slug}/${s.song_slug}`)
    const timeseries = await getCategoryTimeseries("song", topPaths, from, to)

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.songs" },
      status: 200,
    })
    return NextResponse.json({ songs, aggregate, timeseries })
  } catch (err) {
    console.error("[GET /api/admin/analytics/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
