import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"

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
  songs: Array<{ id: number; semitones: number }>
}

/** Callback de progrés real, 0..100. */
export type ProgressFn = (pct: number) => void
