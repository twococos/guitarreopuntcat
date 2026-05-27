import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { cancelProposal } from "@/db/queries/proposals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// L'usuari propietari cancel·la la seva proposta (pending o rejected).
// La cançó associada passa a state=4 i la proposta desapareix de la
// llista de l'usuari (però es conserva per traçabilitat al panell admin).
export async function POST(
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

    const result = await cancelProposal(id, user.id)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/proposals/[id]/cancel]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
