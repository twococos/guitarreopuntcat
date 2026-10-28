import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { enqueueBodySchema, queueSettingsSchema } from "@/lib/schemas/transcriber"
import {
  cancelQueued,
  countJobsByStatus,
  enqueueAnalyzeMissing,
  enqueueJobs,
  getLeaderboards,
  listQueue,
  listWorkers,
} from "@/db/queries/transcriptions"
import { getQueueOrder, setQueueOrder } from "@/db/queries/settings"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Estat de la cua (en l'ordre en què es processarà), ordre FIFO/LIFO, comptadors, workers
 * i classificacions. Les acabades són a /api/admin/transcriptions/finished.
 */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json({
      queue: listQueue(),
      queue_order: getQueueOrder(),
      counts: countJobsByStatus(),
      workers: listWorkers(),
      leaderboards: getLeaderboards(null, Number.MAX_SAFE_INTEGER),
    })
  } catch (err) {
    console.error("[GET /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/**
 * Encua una o més feines, o `analyzeMissing` per a totes les cançons públiques sense anàlisi
 * (`true`) o amb una anàlisi sense estil rítmic (`"rhythm"`).
 */
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
      const missing = parsed.data.analyzeMissing === "rhythm" ? "rhythm" : "analysis"
      const queued = enqueueAnalyzeMissing(parsed.data.priority, user.id, missing)
      return NextResponse.json({ queued })
    }
    const results = enqueueJobs(parsed.data.jobs, parsed.data.priority, user.id)
    return NextResponse.json({ results })
  } catch (err) {
    console.error("[POST /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/** `{ queue_order: "fifo" | "lifo" }` canvia l'ordre de la cua; `{ cancel_queued: true }` la buida. */
export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  try {
    const parsed = queueSettingsSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    if ("queue_order" in parsed.data) {
      setQueueOrder(parsed.data.queue_order)
      logEvent({
        type: "admin_action",
        request: req,
        userId: user.id,
        metadata: { action: `transcription_queue_${parsed.data.queue_order}` },
        status: 200,
      })
      return NextResponse.json({ ok: true })
    }
    const cancelled = cancelQueued()
    logEvent({
      type: "admin_action",
      request: req,
      userId: user.id,
      metadata: { action: "transcription_cancel_queued" },
      status: 200,
    })
    return NextResponse.json({ cancelled })
  } catch (err) {
    console.error("[PATCH /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
