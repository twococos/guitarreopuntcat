import { NextResponse } from "next/server"
import { requireAdmin, requireAuth } from "@/lib/session"
import {
  proposalReviewSchema,
  proposalUpdateSchema,
} from "@/lib/schemas/proposal"
import {
  resubmitProposal,
  reviewProposal,
} from "@/db/queries/proposals"
import { cleanupContent } from "@/lib/importers/cleanupContent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const body = await request.json()
    const parsed = proposalReviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Status ha de ser "approved" o "rejected"' },
        { status: 400 },
      )
    }

    const result = await reviewProposal(
      id,
      user.id,
      parsed.data.status,
      parsed.data.notes,
      parsed.data.status === "approved" ? parsed.data.songUpdate : undefined,
    )

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/proposals/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

// L'usuari propietari modifica i re-envia la seva proposta.
export async function PUT(
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

    const body = await request.json()
    const parsed = proposalUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 })
    }

    const input = { ...parsed.data, content: cleanupContent(parsed.data.content) }
    const result = await resubmitProposal(id, user.id, input)

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PUT /api/proposals/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
