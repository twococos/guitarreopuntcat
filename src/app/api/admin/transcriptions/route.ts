import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { enqueueBodySchema, queueSettingsSchema } from "@/lib/schemas/transcriber"
import {
  cancelQueued,
  countJobsByStatus,
  enqueueAnalyzeMissing,
  enqueueJobs,
  enqueueUpdates,
  getLeaderboards,
  listQueue,
  listWorkers,
  updatesSummary,
} from "@/db/queries/transcriptions"
import { getQueueOrder, setAutoUpdate, setQueueOrder } from "@/db/queries/settings"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Estat de la cua (en l'ordre en què es processarà), ordre FIFO/LIFO, comptadors, workers,
 * classificacions i anàlisis desactualitzades. Les acabades són a /api/admin/transcriptions/finished.
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
      updates: updatesSummary(),
    })
  } catch (err) {
    console.error("[GET /api/admin/transcriptions]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/**
 * Encua una o més feines, `analyzeMissing` per a totes les cançons públiques sense anàlisi
 * (`true`) o amb una anàlisi sense estil rítmic (`"rhythm"`), o `updates` (ids o `"all"`) per
 * tornar a fer anàlisis amb la versió més nova del transcriptor.
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
    if ("updates" in parsed.data) {
      const queued = enqueueUpdates(parsed.data.updates, user.id)
      return NextResponse.json({ queued })
    }
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

/**
 * `{ queue_order: "fifo" | "lifo" }` canvia l'ordre de la cua; `{ cancel_queued: true }` la buida;
 * `{ auto_update: boolean }` activa o desactiva l'actualització automàtica de les anàlisis.
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { user } = auth
  try {
    const parsed = queueSettingsSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    if ("auto_update" in parsed.data) {
      setAutoUpdate(parsed.data.auto_update)
      logEvent({
        type: "admin_action",
        request: req,
        userId: user.id,
        metadata: { action: `transcription_auto_update_${parsed.data.auto_update ? "on" : "off"}` },
        status: 200,
      })
      return NextResponse.json({ ok: true })
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
