/**
 * Helpers de mapping camelCase (Drizzle) ↔ snake_case (API JSON).
 * El frontend antic espera snake_case, Drizzle retorna camelCase.
 */
import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"
import { songKind } from "@/lib/songKind"

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
  artistSlug: string | null
  songSlug: string | null
  key: string
  capo: number | null
  content: string
  language: string | null
  tags: string | null
  album: string | null
  year: number | null
  youtubeUrl: string | null
  spotifyUrl: string | null
  bpm?: number | null
  timeSignature?: string | null
  rhythm?: string | null
  state: number
  ownerId?: number | null
  originalSongId?: number | null
  createdAt: string | null
  updatedAt: string | null
}) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artist_slug: song.artistSlug,
    song_slug: song.songSlug,
    key: song.key,
    capo: song.capo ?? 0,
    content: song.content,
    language: song.language ?? "ca",
    tags: song.tags ?? "",
    album: song.album,
    year: song.year,
    youtube_url: song.youtubeUrl,
    spotify_url: song.spotifyUrl,
    bpm: song.bpm ?? null,
    time_signature: song.timeSignature ?? null,
    rhythm: song.rhythm ?? null,
    state: song.state,
    kind: songKind(song.state, song.originalSongId),
    owner_id: song.ownerId ?? null,
    original_song_id: song.originalSongId ?? null,
    created_at: song.createdAt,
    updated_at: song.updatedAt,
  }
}

/** Song summary sense content ni state */
export function mapSongSummary(song: {
  id: number
  title: string
  artist: string
  artistSlug: string | null
  songSlug: string | null
  key: string
  capo: number | null
  language: string | null
  tags: string | null
  album: string | null
  year: number | null
  youtubeUrl: string | null
  spotifyUrl: string | null
}) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artist_slug: song.artistSlug,
    song_slug: song.songSlug,
    key: song.key,
    capo: song.capo ?? 0,
    language: song.language ?? "ca",
    tags: song.tags ?? "",
    album: song.album,
    year: song.year,
    youtube_url: song.youtubeUrl,
    spotify_url: song.spotifyUrl,
  }
}

/**
 * Resum + estat, per a llistes on cal l'etiqueta del tipus (llista de /app,
 * cerca amb sessió).
 */
export function mapSongListItem(song: Parameters<typeof mapSongSummary>[0] & {
  state: number
  ownerId: number | null
  originalSongId: number | null
}) {
  return {
    ...mapSongSummary(song),
    state: song.state,
    kind: songKind(song.state, song.originalSongId),
    owner_id: song.ownerId,
    original_song_id: song.originalSongId,
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
  visibility?: number
  slug?: string | null
  publishedAt?: string | null
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
    visibility: c.visibility ?? 0,
    slug: c.slug ?? null,
    published_at: c.publishedAt ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}
