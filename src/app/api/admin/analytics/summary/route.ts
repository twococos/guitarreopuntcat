import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSummaryKpis } from "@/db/queries/analytics/summary"
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

    const kpis = await getSummaryKpis(from, to)

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.summary" },
      status: 200,
    })
    return NextResponse.json(kpis)
  } catch (err) {
    console.error("[GET /api/admin/analytics/summary]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
