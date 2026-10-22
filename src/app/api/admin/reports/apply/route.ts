import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getSongById, updateSong } from "@/db/queries/songs"
import { getPendingItemsForApply, reviewItems } from "@/db/queries/reports"
import { applyReportItems } from "@/lib/reports/apply"
import { lineDiff } from "@/lib/reports/diff"
import { reportApplySchema, type ReportItem } from "@/lib/schemas/report"
import { transposeChord } from "@/lib/transpose"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SongUpdate = Parameters<typeof updateSong>[1]

const YOUTUBE_RE = /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//

/** Valor d'un camp de metadades reportat, o null si no és vàlid. */
function metaUpdate(item: Extract<ReportItem, { kind: "meta" }>): SongUpdate | null {
  const v = item.to.trim()
  switch (item.field) {
    case "title":
      return v ? { title: v } : null
    case "artist":
      return v ? { artist: v } : null
    case "album":
      return { album: v ? v.slice(0, 200) : null }
    case "year": {
      if (!v) return { year: null }
      const n = Number(v)
      return Number.isInteger(n) && n >= 1000 && n <= 2100 ? { year: n } : null
    }
    case "capo": {
      const n = v ? Number(v) : 0
      return Number.isInteger(n) && n >= 0 && n <= 12 ? { capo: n } : null
    }
    case "youtube_url":
      if (!v) return { youtubeUrl: null }
      return YOUTUBE_RE.test(v) ? { youtubeUrl: v } : null
    case "youtube_broken":
      return null
  }
}

/**
 * POST /api/admin/reports/apply — aplica correccions (i els seus duplicats).
 * Amb `preview: true` només retorna el diff i què es podria aplicar.
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const parsed = reportApplySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades no vàlides" }, { status: 400 })
    const { song_id, item_ids, preview } = parsed.data

    const song = await getSongById(song_id)
    if (!song) return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })

    const { representatives, membersOf } = getPendingItemsForApply(song_id, item_ids)
    if (!representatives.length) return NextResponse.json({ error: "No hi ha res pendent" }, { status: 409 })

    // Les metadades es validen aquí; la resta, sobre el content
    const update: SongUpdate = {}
    const applied: number[] = []
    const failed: { id: number; reason: string }[] = []
    const contentItems: typeof representatives = []
    for (const r of representatives) {
      if (r.item.kind === "meta" && r.item.field !== "youtube_broken") {
        const u = metaUpdate(r.item)
        if (u) {
          Object.assign(update, u)
          applied.push(r.id)
        } else {
          failed.push({ id: r.id, reason: "invalid" })
        }
      } else {
        contentItems.push(r)
      }
    }

    const result = applyReportItems(song.content, contentItems)
    applied.push(...result.applied)
    failed.push(...result.failed)
    if (result.content !== song.content) update.content = result.content
    if (result.keyShift) update.key = transposeChord(song.key, result.keyShift)

    if (preview) {
      return NextResponse.json({
        diff: lineDiff(song.content, result.content),
        applied,
        failed,
        changes: Object.fromEntries(Object.entries(update).filter(([k]) => k !== "content")),
      })
    }

    if (!applied.length) return NextResponse.json({ error: "No s'ha pogut aplicar res", failed }, { status: 409 })

    if (Object.keys(update).length) await updateSong(song_id, update)
    reviewItems(
      applied.flatMap((id) => membersOf.get(id) ?? [id]),
      "applied",
      user.id,
    )

    return NextResponse.json({ applied, failed })
  } catch (err) {
    console.error("[POST /api/admin/reports/apply]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
