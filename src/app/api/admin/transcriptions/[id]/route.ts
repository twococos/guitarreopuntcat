import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { jobActionSchema } from "@/lib/schemas/transcriber"
import { parseId } from "@/lib/transcriber/routeUtils.server"
import { jobAction } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** `{ action: "cancel" | "retry" }` */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    const parsed = jobActionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    if (!jobAction(id, parsed.data.action)) {
      return NextResponse.json({ error: "La feina no existeix o no és en un estat vàlid" }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/admin/transcriptions/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
