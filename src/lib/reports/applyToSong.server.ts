import "server-only"
import { getSongById, updateSong } from "@/db/queries/songs"
import { getPendingItemsForApply, reviewItems } from "@/db/queries/reports"
import { applyReportItems } from "@/lib/reports/apply"
import { lineDiff } from "@/lib/reports/diff"
import type { ReportItem } from "@/lib/schemas/report"
import { transposeChord } from "@/lib/transpose"

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

export type ApplyOutcome =
  | { status: "not_found" }
  | { status: "nothing_pending" }
  | {
      status: "ok"
      diff: ReturnType<typeof lineDiff>
      applied: number[]
      failed: { id: number; reason: string }[]
      changes: Record<string, unknown>
    }

/**
 * Aplica a la cançó els ítems pendents indicats (i els seus duplicats).
 * Amb `preview` només calcula el diff; altrament desa la cançó i marca els
 * aplicats com a revisats per `reviewerId`. Els que fallen queden pendents.
 */
export async function applyPendingReportItems(
  songId: number,
  itemIds: number[],
  reviewerId: number,
  preview = false,
): Promise<ApplyOutcome> {
  const song = await getSongById(songId)
  if (!song) return { status: "not_found" }

  const { representatives, membersOf } = getPendingItemsForApply(songId, itemIds)
  if (!representatives.length) return { status: "nothing_pending" }

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

  const outcome = {
    status: "ok" as const,
    diff: lineDiff(song.content, result.content),
    applied,
    failed,
    changes: Object.fromEntries(Object.entries(update).filter(([k]) => k !== "content")),
  }
  if (preview || !applied.length) return outcome

  if (Object.keys(update).length) await updateSong(songId, update)
  reviewItems(
    applied.flatMap((id) => membersOf.get(id) ?? [id]),
    "applied",
    reviewerId,
  )
  return outcome
}
