import { NextResponse } from "next/server"
import { failBodySchema } from "@/lib/schemas/transcriber"
import { authenticateWorker } from "@/lib/transcriber/auth.server"
import { jobLostResponse, parseId, readJsonBody } from "@/lib/transcriber/routeUtils.server"
import { failJob } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** El worker no ha pogut acabar la feina (`released`: s'ha aturat; torna a la cua sense penalitzar). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })

    const parsed = failBodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    if (!failJob(worker.id, id, parsed.data)) return jobLostResponse()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/transcriber/jobs/[id]/fail]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
