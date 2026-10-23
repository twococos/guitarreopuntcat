import type { PdfOptions } from "@/lib/schemas/canconer"
import type { CanconerStyle } from "@/types/song"
import type { QuickArrangement } from "@/lib/schemas/arrangement"
import type { SongbookViewerData } from "./SongbookViewer"

/** Forma de les consultes de cançoners (getPublicSongbook, getCanconerByToken…). */
interface SongbookQueryResult {
  id: number
  title: string
  owner_name: string
  style: CanconerStyle
  accent_color: string | null
  pdf_options: PdfOptions | null
  songs: Array<{
    id: number
    title: string
    artist: string
    artist_slug: string | null
    song_slug: string | null
    key: string
    capo: number
    content: string
    album: string | null
    year: number | null
    youtube_url: string | null
    spotify_url: string | null
    state: number
    semitones: number
    arrangement?: QuickArrangement | null
    rhythm?: string | null
  }>
}

/** Només el que necessita el visor (no passem propietaris ni dates al client). */
export function toViewerData(c: SongbookQueryResult): SongbookViewerData {
  return {
    id: c.id,
    title: c.title,
    owner_name: c.owner_name,
    style: c.style,
    accent_color: c.accent_color,
    pdf_options: c.pdf_options,
    songs: c.songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      artist_slug: s.artist_slug,
      song_slug: s.song_slug,
      key: s.key,
      capo: s.capo,
      content: s.content,
      album: s.album,
      year: s.year,
      youtube_url: s.youtube_url,
      spotify_url: s.spotify_url,
      state: s.state,
      semitones: s.semitones,
      arrangement: s.arrangement ?? null,
      rhythm: s.rhythm ?? null,
    })),
  }
}

/** ?song=N (1-based) → índex 0-based. */
export function initialIndexFrom(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0
}

/** Primeres cançons per a la meta description. */
export function sampleTitles(c: { songs: Array<{ title: string }> }, n = 4): string {
  return c.songs.slice(0, n).map((s) => s.title).join(", ")
}
