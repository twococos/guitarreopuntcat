import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getSongById } from "@/db/queries/songs"
import { getSongReportGroups } from "@/db/queries/reports"
import { parse } from "@/lib/editor/model"
import { applyReportItems, blockLine, resolveBlock } from "@/lib/reports/apply"
import { contentHash } from "@/lib/reports/dedupe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/reports/song/[songId] — la cançó i els seus ítems agrupats.
 * Per a cada grup pendent diu si es pot aplicar sobre el content actual
 * (`apply_status`) i a quina línia és ara (`current_block`, per a l'editor).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ songId: string }> }) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const songId = Number((await params).songId)
    if (!Number.isInteger(songId) || songId <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }
    const song = await getSongById(songId)
    if (!song) return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })

    const lines = parse(song.content).blocks.map(blockLine)
    const hash = contentHash(song.content)
    const groups = getSongReportGroups(songId).map((g) => {
      const item = g.item
      const current_block = "block" in item ? resolveBlock(lines, item.block, item.line) : null
      let apply_status: string | null = null
      if (g.status === "pending") {
        const r = applyReportItems(song.content, [{ id: 0, item }])
        apply_status = r.failed[0]?.reason ?? "ok"
      }
      return { ...g, current_block, apply_status, content_changed: g.content_hash !== hash }
    })

    return NextResponse.json({
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        key: song.key,
        capo: song.capo,
        album: song.album,
        year: song.year,
        youtube_url: song.youtube_url,
        content: song.content,
        href: song.artist_slug && song.song_slug ? `/songs/${song.artist_slug}/${song.song_slug}` : null,
      },
      groups,
    })
  } catch (err) {
    console.error("[GET /api/admin/reports/song/[songId]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
