import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getTopSearches, getZeroResultSearches } from "@/db/queries/analytics/searches"
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

    const limit = parseLimit(searchParams, 20, 100)
    if (limit instanceof NextResponse) return limit

    const [top, zero_results] = await Promise.all([
      getTopSearches(from, to, limit),
      getZeroResultSearches(from, to, limit),
    ])

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.searches" },
      status: 200,
    })
    return NextResponse.json({ top, zero_results })
  } catch (err) {
    console.error("[GET /api/admin/analytics/searches]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
