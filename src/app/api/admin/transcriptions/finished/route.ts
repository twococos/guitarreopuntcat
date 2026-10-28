import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { finishedQuerySchema } from "@/lib/schemas/transcriber"
import { listFinished } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Feines acabades: `?status=done|failed|cancelled&worker=ID&limit=N` (fins a 500). */
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const params = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = finishedQuerySchema.safeParse(params)
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    const { status, worker, limit } = parsed.data
    return NextResponse.json({ jobs: listFinished({ status, workerId: worker, limit }) })
  } catch (err) {
    console.error("[GET /api/admin/transcriptions/finished]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
