import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getPendingCount } from "@/db/queries/proposals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const result = await getPendingCount()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[GET /api/proposals/pending-count]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
