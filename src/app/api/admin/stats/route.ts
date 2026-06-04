import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getStats } from "@/db/queries/admin"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const stats = await getStats()
    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "stats.view" },
      status: 200,
    })
    return NextResponse.json(stats)
  } catch (err) {
    console.error("[GET /api/admin/stats]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
