import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { listAllUsers } from "@/db/queries/admin"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const users = await listAllUsers()
    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "users.list" },
      status: 200,
    })
    return NextResponse.json(users)
  } catch (err) {
    console.error("[GET /api/admin/users]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
