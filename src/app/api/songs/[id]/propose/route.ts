import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { proposalInputSchema } from "@/lib/schemas/proposal"
import { proposeOwnSong } from "@/db/queries/proposals"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/songs/[id]/propose — l'usuari proposa com a pública una cançó
 * privada seva, amb el contingut del body (el de l'editor). Passa a pendent i
 * surt a les propostes de l'admin.
 */
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
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const parsed = proposalInputSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 })
    }

    const result = proposeOwnSong(id, user.id, parsed.data)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    logEvent({
      type: "proposal_create",
      request,
      userId: user.id,
      metadata: { proposal_id: result.proposalId },
      status: 200,
    })
    return NextResponse.json({ ok: true, proposalId: result.proposalId })
  } catch (err) {
    console.error("[POST /api/songs/[id]/propose]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
