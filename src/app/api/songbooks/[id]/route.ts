import { NextResponse } from "next/server"
import { getPublicSongbook } from "@/db/queries/canconers"
import { getSessionUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/songbooks/[id] — el que cal per copiar un cançoner públic a
 * l'editor (mateixa forma que `load_canconer`, sense `id`). 404 si no és públic.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }
    const c = await getPublicSongbook(id, await getSessionUser())
    if (!c) {
      return NextResponse.json({ error: "No trobat" }, { status: 404 })
    }
    return NextResponse.json({
      title: c.title,
      style: c.style,
      accent_color: c.accent_color,
      pdf_options: c.pdf_options,
      songs: c.songs.map((s) => ({
        id: s.id,
        semitones: s.semitones,
        arrangement: s.arrangement,
        state: s.state,
      })),
    })
  } catch (err) {
    console.error("[GET /api/songbooks/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
