import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { updateWorkerSchema } from "@/lib/schemas/transcriber"
import { parseId } from "@/lib/transcriber/routeUtils.server"
import { deleteWorker, setWorkerActive } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** `{ active }`: desactivar revoca el token (el worker rep 401). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    const parsed = updateWorkerSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    if (!setWorkerActive(id, parsed.data.active)) {
      return NextResponse.json({ error: "Worker no trobat" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/admin/transcription-workers/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/** Elimina el worker; les seves feines en curs tornen a la cua. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    if (!deleteWorker(id)) return NextResponse.json({ error: "Worker no trobat" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/admin/transcription-workers/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
