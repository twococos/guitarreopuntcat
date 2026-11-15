import { NextResponse } from "next/server"
import { authenticateWorker } from "@/lib/transcriber/auth.server"
import { listAnalyzedSongs } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cançons amb anàlisi, per al depurador del transcriptor (`tx depura`). `?q=` filtra per títol o artista. */
export async function GET(req: Request) {
  try {
    const worker = authenticateWorker(req)
    if (worker instanceof NextResponse) return worker
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500)
    return NextResponse.json({ songs: listAnalyzedSongs(url.searchParams.get("q") ?? "", limit) })
  } catch (err) {
    console.error("[GET /api/transcriber/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
