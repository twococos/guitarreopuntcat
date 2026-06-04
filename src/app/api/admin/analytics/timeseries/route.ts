import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getTimeseries } from "@/db/queries/analytics/timeseries"
import { parseDateRange } from "../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const metricSchema = z.string().min(1)

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { searchParams } = new URL(request.url)

    const rawMetric = searchParams.get("metric")
    const parsedMetric = metricSchema.safeParse(rawMetric)
    if (!parsedMetric.success) {
      return NextResponse.json(
        { error: "El parametre 'metric' es obligatori" },
        { status: 400 },
      )
    }
    const metric = parsedMetric.data

    const dimension = searchParams.get("dimension") ?? "_total"

    const dateRange = parseDateRange(searchParams)
    if (dateRange instanceof NextResponse) return dateRange
    const { from, to } = dateRange

    const points = await getTimeseries(metric, dimension, from, to)

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.timeseries" },
      status: 200,
    })
    return NextResponse.json({ points })
  } catch (err) {
    console.error("[GET /api/admin/analytics/timeseries]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
