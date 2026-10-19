import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/session"
import { setSongbookVisibility } from "@/db/queries/canconers"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ visibility: z.union([z.literal(0), z.literal(1)]) })

/**
 * POST /api/canconers/[id]/visibility `{visibility: 0|1}` — publica o retira
 * de la web un cançoner (propietari, o admin per moderar). Retorna
 * `{visibility, slug, private_count}`.
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

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Visibilitat invàlida" }, { status: 400 })
    }

    const result = setSongbookVisibility(id, user, parsed.data.visibility)
    if (!result) {
      return NextResponse.json({ error: "No trobat" }, { status: 404 })
    }

    logEvent({
      type: "canconer_publish",
      request,
      userId: user.id,
      metadata: { canconer_id: id, visibility: result.visibility },
      status: 200,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/canconers/[id]/visibility]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
