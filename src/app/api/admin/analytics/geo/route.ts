import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSessionsByCountry } from "@/db/queries/analytics/geo"
import { parseDateRange } from "../_utils"

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

    const countries = await getSessionsByCountry(from, to)

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.geo" },
      status: 200,
    })
    return NextResponse.json({ countries })
  } catch (err) {
    console.error("[GET /api/admin/analytics/geo]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
