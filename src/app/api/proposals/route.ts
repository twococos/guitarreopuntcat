import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { proposalInputSchema } from "@/lib/schemas/proposal"
import { listProposals, createProposal } from "@/db/queries/proposals"

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

    const result = await createProposal(user.id, parsed.data)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error("[POST /api/proposals]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
