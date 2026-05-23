/**
 * Helpers de mapping camelCase (Drizzle) ↔ snake_case (API JSON).
 * El frontend antic espera snake_case, Drizzle retorna camelCase.
 */
import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"

export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase()
    result[snakeKey] = value
  }
  return result
}

/** Mapeig explícit per Song (Drizzle camelCase → snake_case API) */
export function mapSong(song: {
  id: number
  title: string
  artist: string
  key: string
  capo: number | null
  content: string
  language: string | null
  tags: string | null
  draft: number | null
  createdAt: string | null
}) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    key: song.key,
    capo: song.capo ?? 0,
    content: song.content,
    language: song.language ?? "ca",
    tags: song.tags ?? "",
    draft: song.draft ?? 0,
    created_at: song.createdAt,
  }
}

/** Song summary sense content ni draft ni created_at */
export function mapSongSummary(song: {
  id: number
  title: string
  artist: string
  key: string
  capo: number | null
  language: string | null
  tags: string | null
}) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    key: song.key,
    capo: song.capo ?? 0,
    language: song.language ?? "ca",
    tags: song.tags ?? "",
  }
}

/** Mapeig explícit per Canconer (Drizzle camelCase → snake_case API) */
export function mapCanconer(c: {
  id: number
  userId: number
  title: string
  shareToken: string | null
  style: string
  accentColor: string | null
  pdfOptions?: PdfOptions | null
  createdAt: string | null
  updatedAt: string | null
}) {
  return {
    id: c.id,
    user_id: c.userId,
    title: c.title,
    share_token: c.shareToken,
    style: c.style as CanconerStyle,
    accent_color: c.accentColor,
    pdf_options: c.pdfOptions ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}
