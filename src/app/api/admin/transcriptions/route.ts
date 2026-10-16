import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { enqueueBodySchema } from "@/lib/schemas/transcriber"
import {
  countJobsByStatus,
  enqueueAnalyzeMissing,
  enqueueJobs,
  getLeaderboards,
  listJobs,
  listWorkers,
} from "@/db/queries/transcriptions"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Estat de la cua: feines actives + darreres acabades, comptadors, workers i classificacions. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json({
      jobs: listJobs(),
      counts: countJobsByStatus(),
      workers: listWorkers(),
      leaderboards: getLeaderboards(null, Number.MAX_SAFE_INTEGER),
    })
  } catch (err) {
    console.error("[GET /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/** Encua una o més feines, o `analyzeMissing` per a totes les cançons públiques sense anàlisi. */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  try {
    const parsed = enqueueBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    logEvent({
      type: "admin_action",
      request: req,
      userId: user.id,
      metadata: { action: "transcription_enqueue" },
      status: 200,
    })
    if ("analyzeMissing" in parsed.data) {
      const queued = enqueueAnalyzeMissing(parsed.data.priority, user.id)
      return NextResponse.json({ queued })
    }
    const results = enqueueJobs(parsed.data.jobs, parsed.data.priority, user.id)
    return NextResponse.json({ results })
  } catch (err) {
    console.error("[POST /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
