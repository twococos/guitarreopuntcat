import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { listAllCanconers } from "@/db/queries/admin"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const canconers = await listAllCanconers()
    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "canconers.list" },
      status: 200,
    })
    return NextResponse.json(canconers)
  } catch (err) {
    console.error("[GET /api/admin/canconers]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
