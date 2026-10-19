import { NextResponse } from "next/server"
import { getSongById } from "@/db/queries/songs"
import { getCurrentSongAnalysis } from "@/db/queries/transcriptions"
import { syncAnalysis } from "@/lib/transcriber/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/songs/[id]/analysis — anàlisi vigent d'una cançó (format compacte v2).
 * Amb `?sync=1`, també la sincronització amb el content actual (src/lib/transcriber/sync.ts),
 * calculada al moment. Mateix accés que GET /api/songs/[id].
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const song = await getSongById(id)
    if (!song) {
      return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
    }
    // Null si no n'hi ha o si el youtubeUrl ha canviat des que es va fer (és d'un altre àudio)
    const row = getCurrentSongAnalysis(id)
    if (!row) {
      return NextResponse.json({ error: "La cançó no té cap anàlisi vigent" }, { status: 404 })
    }

    const body: Record<string, unknown> = {
      analysis: row.analysis,
      meta: {
        format_version: row.formatVersion,
        app_version: row.appVersion,
        device: row.device,
        lyrics_source: row.lyricsSource,
        created_at: row.createdAt,
      },
    }
    if (new URL(request.url).searchParams.get("sync") === "1") {
      body.sync = syncAnalysis(row.analysis, song.content, song.capo)
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error("[GET /api/songs/[id]/analysis]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
