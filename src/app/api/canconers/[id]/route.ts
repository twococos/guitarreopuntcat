import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { getCanconerById, deleteCanconer } from "@/db/queries/canconers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
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

    const canconer = await getCanconerById(id, user.id)
    if (!canconer) {
      return NextResponse.json({ error: "No trobat" }, { status: 404 })
    }

    return NextResponse.json(canconer)
  } catch (err) {
    console.error("[GET /api/canconers/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
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

    const result = await deleteCanconer(id, user.id)
    if (result.changes === 0) {
      return NextResponse.json({ error: "No trobat" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/canconers/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
