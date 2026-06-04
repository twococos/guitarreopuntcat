import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSuspiciousIps, getBlockedIps } from "@/db/queries/analytics/suspicious"
import { parseLimit } from "../_utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { searchParams } = new URL(request.url)

    const limit = parseLimit(searchParams, 50, 200)
    if (limit instanceof NextResponse) return limit

    const [suspicious, blocked] = await Promise.all([
      getSuspiciousIps(limit),
      getBlockedIps(),
    ])

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.ips" },
      status: 200,
    })
    return NextResponse.json({ suspicious, blocked })
  } catch (err) {
    console.error("[GET /api/admin/analytics/ips]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
