import { NextResponse } from "next/server"
import { authenticateWorker, checkMinVersionFromUserAgent } from "@/lib/transcriber/auth.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Dades del worker del token. L'app hi pren el nom que li ha posat l'admin (i valida el token en desar-lo). */
export async function GET(req: Request) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const tooOld = checkMinVersionFromUserAgent(req)
    if (tooOld) return tooOld

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      active: !!worker.active,
      jobs_done: worker.jobsDone,
    })
  } catch (err) {
    console.error("[GET /api/transcriber/me]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
