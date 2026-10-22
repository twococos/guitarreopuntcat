import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { listReportedSongs } from "@/db/queries/reports"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/admin/reports?status=pending|resolved — cançons amb reports. */
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const status = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "pending"
    return NextResponse.json(listReportedSongs(status))
  } catch (err) {
    console.error("[GET /api/admin/reports]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
