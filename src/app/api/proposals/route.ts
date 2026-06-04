import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { proposalInputSchema } from "@/lib/schemas/proposal"
import { listProposals, createProposal } from "@/db/queries/proposals"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const proposals = await listProposals(user.role === "admin", user.id)
    return NextResponse.json(proposals)
  } catch (err) {
    console.error("[GET /api/proposals]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const body = await request.json()
    const parsed = proposalInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Falten camps obligatoris" }, { status: 400 })
    }

    const input = { ...parsed.data, content: cleanupContent(parsed.data.content) }
    const result = await createProposal(user.id, input)
    logEvent({
      type: "proposal_create",
      request,
      userId: user.id,
      metadata: { proposal_id: result.proposalId },
      status: 201,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error("[POST /api/proposals]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
