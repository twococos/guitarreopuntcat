import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { expandWithDuplicates, reviewItems } from "@/db/queries/reports"
import { reportReviewSchema } from "@/lib/schemas/report"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/reports/review — rebutja ítems i els seus duplicats, o els
 * marca com a aplicats si l'admin ja els ha corregit a mà a l'editor.
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const parsed = reportReviewSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades no vàlides" }, { status: 400 })

    const ids = expandWithDuplicates(parsed.data.item_ids)
    reviewItems(ids, parsed.data.status, user.id)
    return NextResponse.json({ ok: true, count: ids.length })
  } catch (err) {
    console.error("[POST /api/admin/reports/review]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
