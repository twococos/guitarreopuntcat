import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { shareActionSchema } from "@/lib/schemas/canconer"
import { toggleShare } from "@/db/queries/canconers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = shareActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Acció invàlida" }, { status: 400 })
    }

    const result = await toggleShare(id, user.id, parsed.data.action)
    if (!result) {
      return NextResponse.json({ error: "No trobat" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/canconers/[id]/share]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
