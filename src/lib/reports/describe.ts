/**
 * src/lib/reports/describe.ts — Frase curta que resumeix un ítem de report
 * (llista de l'usuari abans d'enviar i panell d'admin).
 */

import { getT } from "@/lib/i18n"
import type { ReportItem } from "@/lib/schemas/report"

/** `show` passa un acord (to original) a com s'ha de mostrar. */
export function describeItem(item: ReportItem, show: (chord: string) => string = (c) => c): string {
  const d = getT().public.report.describe
  // El text nou pot portar acords: es mostren entre claudàtors
  const inline = (text: string) => text.replace(/<ch>([^<]*)<\/ch>/g, (_m, c: string) => `[${show(c)}]`)
  const meta = getT().public.report.meta
  switch (item.kind) {
    case "chord_replace":
      return item.scope === "all"
        ? d.chordReplaceAll(show(item.from), show(item.to))
        : d.chordReplace(show(item.from), show(item.to))
    case "chord_add":
      return d.chordAdd(show(item.chord))
    case "chord_move":
      return d.chordMove(show(item.chord))
    case "chord_remove":
      return d.chordRemove(show(item.chord))
    case "song_key":
      return d.songKey(item.from_key, item.to_key)
    case "lyric_replace":
      if (!item.to) return d.lyricRemove(item.from)
      if (item.start === item.end) return d.lyricAdd(inline(item.to))
      return d.lyricReplace(item.from, inline(item.to))
    case "lyric_add_line":
      return d.lyricLine(inline(item.text))
    case "lyric_version":
      return item.text ? `${d.lyricVersion}: ${item.text}` : d.lyricVersion
    case "section_rename":
      return d.sectionRename(item.from, item.to)
    case "section_add":
      return d.sectionAdd(item.name)
    case "section_remove":
      return d.sectionRemove(item.name)
    case "section_missing":
      return d.sectionMissing(item.name)
    case "meta":
      if (item.field === "youtube_broken") return d.youtubeBroken
      return d.meta(meta[item.field], item.from, item.to)
    case "other":
      return `${d.other}: ${item.text}`
  }
}
