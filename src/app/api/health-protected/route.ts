import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  return NextResponse.json({
    status: "ok",
    user: result.user,
  })
}
