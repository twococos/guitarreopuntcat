import { NextResponse } from "next/server"
import { authenticateWorker } from "@/lib/transcriber/auth.server"
import { jobLostResponse, parseId } from "@/lib/transcriber/routeUtils.server"
import { heartbeatJob } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Allarga el lease. 409 si la feina ja no és d'aquest worker (caducada, cancel·lada…). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })

    if (!heartbeatJob(worker.id, id)) return jobLostResponse()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/transcriber/jobs/[id]/heartbeat]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
