import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSessionDetail, getSessionEvents } from "@/db/queries/analytics/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const sessionIdSchema = z.string().min(1)

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const rawSessionId = searchParams.get("session_id")
    const parsedSessionId = sessionIdSchema.safeParse(rawSessionId)
    if (!parsedSessionId.success) {
      return NextResponse.json(
        { error: "El parametre 'session_id' es obligatori" },
        { status: 400 },
      )
    }
    const session_id = parsedSessionId.data

    const [detail, events] = await Promise.all([
      getSessionDetail(session_id),
      getSessionEvents(session_id, 200),
    ])

    if (detail === null) {
      return NextResponse.json({ error: "Sessio no trobada" }, { status: 404 })
    }

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.session" },
      status: 200,
    })
    return NextResponse.json({ detail, events })
  } catch (err) {
    console.error("[GET /api/admin/analytics/session]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
