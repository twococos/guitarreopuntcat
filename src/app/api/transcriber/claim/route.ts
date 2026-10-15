import { NextResponse } from "next/server"
import { claimBodySchema } from "@/lib/schemas/transcriber"
import { authenticateWorker, checkMinVersion } from "@/lib/transcriber/auth.server"
import { readJsonBody } from "@/lib/transcriber/routeUtils.server"
import { claimJob } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** El worker demana la següent feina. 204 si la cua és buida. */
export async function POST(req: Request) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker

    const parsed = claimBodySchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    const tooOld = checkMinVersion(parsed.data.app_version)
    if (tooOld) return tooOld

    const job = claimJob(worker, {
      appVersion: parsed.data.app_version,
      device: { ...parsed.data.device, hostname: parsed.data.worker },
    })
    if (!job) return new NextResponse(null, { status: 204 })
    return NextResponse.json({ job })
  } catch (err) {
    console.error("[POST /api/transcriber/claim]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
