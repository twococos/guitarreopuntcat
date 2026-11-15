import { NextResponse } from "next/server"
import { authenticateWorker } from "@/lib/transcriber/auth.server"
import { parseId } from "@/lib/transcriber/routeUtils.server"
import { songForDebug } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Les dades d'una cançó per refer-ne el postprocés en local (`tx depura`): les mateixes que una feina
 * `update` (content, fonts d'acords, anàlisi i dades crues), sense crear cap feina.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })

    const song = songForDebug(id)
    if (!song) return NextResponse.json({ error: "La cançó no existeix o no té anàlisi" }, { status: 404 })
    return NextResponse.json(song)
  } catch (err) {
    console.error("[GET /api/transcriber/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
