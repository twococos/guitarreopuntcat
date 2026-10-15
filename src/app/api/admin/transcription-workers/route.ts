import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { createWorkerSchema } from "@/lib/schemas/transcriber"
import { createWorker } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Crea un worker. El token només es retorna aquí: després no es pot recuperar. */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const parsed = createWorkerSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    return NextResponse.json(createWorker(parsed.data.name, auth.user.id), { status: 201 })
  } catch (err) {
    console.error("[POST /api/admin/transcription-workers]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
