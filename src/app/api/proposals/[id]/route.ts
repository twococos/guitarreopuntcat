import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { proposalReviewSchema } from "@/lib/schemas/proposal"
import { reviewProposal } from "@/db/queries/proposals"

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
