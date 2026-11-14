import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { applyPendingReportItems } from "@/lib/reports/applyToSong.server"
import { reportApplySchema } from "@/lib/schemas/report"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/reports/apply — aplica correccions (i els seus duplicats).
 * Amb `preview: true` només retorna el diff i què es podria aplicar.
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const parsed = reportApplySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades no vàlides" }, { status: 400 })
    const { song_id, item_ids, preview } = parsed.data

    const outcome = await applyPendingReportItems(song_id, item_ids, user.id, preview)
    if (outcome.status === "not_found") return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
    if (outcome.status === "nothing_pending") {
      return NextResponse.json({ error: "No hi ha res pendent" }, { status: 409 })
    }

    const { diff, applied, failed, changes } = outcome
    if (preview) return NextResponse.json({ diff, applied, failed, changes })
    if (!applied.length) return NextResponse.json({ error: "No s'ha pogut aplicar res", failed }, { status: 409 })
    return NextResponse.json({ applied, failed })
  } catch (err) {
    console.error("[POST /api/admin/reports/apply]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
