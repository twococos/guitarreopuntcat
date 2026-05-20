import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { listAllUsers } from "@/db/queries/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const users = await listAllUsers()
    return NextResponse.json(users)
  } catch (err) {
    console.error("[GET /api/admin/users]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
