import { NextResponse } from "next/server"
import { authenticateWorker, checkMinVersionFromUserAgent } from "@/lib/transcriber/auth.server"
import { getLeaderboards } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Classificacions dels workers (sempre i aquest mes), amb la posició del worker que consulta. */
export async function GET(req: Request) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const tooOld = checkMinVersionFromUserAgent(req)
    if (tooOld) return tooOld

    return NextResponse.json({ me: { id: worker.id, name: worker.name }, ...getLeaderboards(worker.id) })
  } catch (err) {
    console.error("[GET /api/transcriber/leaderboard]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
