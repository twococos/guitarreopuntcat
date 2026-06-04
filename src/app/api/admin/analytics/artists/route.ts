import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import {
  getTopArtists,
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

    const artists = await getTopArtists(from, to, limit)
    const aggregate = await getCategoryAggregate("artist", from, to)

    const topPaths = artists.slice(0, 8).map((a) => `/songs/${a.artist_slug}`)
    const timeseries = await getCategoryTimeseries("artist", topPaths, from, to)

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.artists" },
      status: 200,
    })
    return NextResponse.json({ artists, aggregate, timeseries })
  } catch (err) {
    console.error("[GET /api/admin/analytics/artists]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
