import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { copySongbookAsPublic } from "@/db/queries/canconers"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/admin/canconers/[id]/copy — còpia pública del cançoner, de l'admin. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const copy = copySongbookAsPublic(id, user.id)
    if (!copy) return NextResponse.json({ error: "No trobat" }, { status: 404 })

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "canconers.copy_public", target_id: id },
      status: 200,
    })
    return NextResponse.json(copy)
  } catch (err) {
    console.error("[POST /api/admin/canconers/[id]/copy]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
