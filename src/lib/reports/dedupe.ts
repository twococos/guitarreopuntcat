/**
 * src/lib/reports/dedupe.ts — Claus per agrupar reports iguals i hash del content.
 * Pur: el fan servir el navegador (hash del que veu l'usuari) i el servidor.
 */

import type { ReportItem } from "@/lib/schemas/report"
import { normalizeChord } from "./apply"

/** FNV-1a de 32 bits en hexadecimal: prou per saber si el content ha canviat. */
export function contentHash(content: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function norm(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Dos ítems amb la mateixa clau diuen el mateix (mateix lloc i mateixa
 * correcció): a l'admin es mostren una sola vegada amb «×N persones».
 */
export function dedupeKey(item: ReportItem): string {
  const parts: (string | number)[] = [item.kind]
  switch (item.kind) {
    case "chord_replace":
      parts.push(item.block, item.line, item.chord_idx, normalizeChord(item.to), item.scope)
      break
    case "chord_add":
      parts.push(item.block, item.line, item.offset, normalizeChord(item.chord))
      break
    case "chord_move":
      parts.push(item.block, item.line, item.chord_idx, item.to_block, item.to_line, item.to_offset)
      break
    case "chord_remove":
      parts.push(item.block, item.line, item.chord_idx)
      break
    case "song_key":
      parts.push(item.semitones)
      break
    case "lyric_replace":
      parts.push(item.block, item.line, item.start, item.end, norm(item.to))
      break
    case "lyric_add_line":
      parts.push(item.block, item.line, norm(item.text))
      break
    case "section_rename":
      parts.push(item.block, item.line, item.to)
      break
    case "section_add":
    case "section_remove":
      parts.push(item.block, item.line, item.kind === "section_add" ? item.name : "")
      break
    case "section_missing":
      parts.push(item.block, item.line, item.position, item.name, item.copy_of?.line ?? norm(item.text))
      break
    case "meta":
      parts.push(item.field, norm(item.to))
      break
    case "lyric_version":
    case "other":
      parts.push(norm(item.text))
      break
  }
  return contentHash(JSON.stringify(parts)) + ":" + item.kind
}
