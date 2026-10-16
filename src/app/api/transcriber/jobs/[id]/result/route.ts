import { NextResponse } from "next/server"
import { resultBodySchema } from "@/lib/schemas/transcriber"
import { authenticateWorker } from "@/lib/transcriber/auth.server"
import { jobLostResponse, parseId, readJsonBody } from "@/lib/transcriber/routeUtils.server"
import { completeJob } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Resultat d'una feina: proposta (forma d'ImportResult) + anàlisi en format compacte + estadístiques (opcionals). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const id = parseId((await params).id)
    if (!id) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })

    const parsed = resultBodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 5)
      console.error("[POST /api/transcriber/jobs/[id]/result] cos invàlid", issues)
      return NextResponse.json({ error: "Dades invàlides", issues }, { status: 400 })
    }

    const result = completeJob(worker, id, parsed.data.proposal, parsed.data.analysis, parsed.data.stats ?? null)
    if (result.status === "lost") return jobLostResponse()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/transcriber/jobs/[id]/result]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
