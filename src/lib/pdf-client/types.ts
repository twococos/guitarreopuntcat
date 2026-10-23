import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"
import type { CanconerSongRef } from "@/types/song"

/** Dades d'una cançó necessàries per maquetar-la al PDF. */
export interface PdfSong {
  title: string
  artist: string
  key: string
  capo: number | null
  content: string
  semitones: number
  album: string | null
  year: number | null
  youtubeUrl: string | null
  spotifyUrl: string | null
}

/** Entrada pública del generador. */
export interface PdfClientInput {
  title: string
  style: CanconerStyle
  accentColor: string | null
  options: PdfOptions
  songs: CanconerSongRef[]
  /** Cançoner d'on surten les cançons: fa visibles les privades que en formen
   *  part (src/lib/access/songs.ts, regla 5). */
  context?: { songbook_id: number } | { share_token: string }
}

/** Callback de progrés real, 0..100. */
export type ProgressFn = (pct: number) => void
