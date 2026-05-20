import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getStats } from "@/db/queries/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const stats = await getStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error("[GET /api/admin/stats]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
