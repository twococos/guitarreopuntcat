import type { PdfClientInput, PdfSong, ProgressFn } from "./types"
import { buildBookParts } from "./html"
import { createBookFrame } from "./frame"
import { paginate } from "./paginate"
import { writePdf } from "./writer"

/**
 * Generador de PDF al navegador.
 *
 *   dades (/api/pdf/songs) → HTML (html.ts) → iframe (frame.ts)
 *     → paginació real en pàgines A4 (paginate.ts)
 *     → calc DOM → PDF vectorial (writer/)
 *
 * Mòdul pesant (pdf-lib + fontkit): carrega'l sempre amb
 * `await import("@/lib/pdf-client")`, mai amb import estàtic.
 */

interface SongsResponse {
  songs: Array<{
    title: string
    artist: string
    key: string
    capo: number | null
    content: string
    semitones: number
    album: string | null
    year: number | null
    youtube_url: string | null
    spotify_url: string | null
  }>
}

async function fetchSongs(input: PdfClientInput): Promise<PdfSong[]> {
  const res = await fetch("/api/pdf/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ style: input.style, songs: input.songs, context: input.context }),
  })
  if (!res.ok) throw new Error(`/api/pdf/songs ${res.status}`)
  const data = (await res.json()) as SongsResponse
  return data.songs.map((s) => ({
    title: s.title,
    artist: s.artist,
    key: s.key,
    capo: s.capo,
    content: s.content,
    semitones: s.semitones,
    album: s.album,
    year: s.year,
    youtubeUrl: s.youtube_url,
    spotifyUrl: s.spotify_url,
  }))
}

export interface GenerateOptions {
  onProgress?: ProgressFn
  /** Deixa l'iframe visible a sobre de la pàgina (doble clic el tanca). */
  debug?: boolean
}

export async function generatePdfClient(input: PdfClientInput, opts: GenerateOptions = {}): Promise<Blob> {
  const report = (from: number, to: number) => (pct: number) =>
    opts.onProgress?.(from + ((to - from) * Math.min(100, Math.max(0, pct))) / 100)

  // En mode debug, temps de cada fase a la consola.
  let last = performance.now()
  const phase = (name: string) => {
    if (!opts.debug) return
    const now = performance.now()
    console.info(`[pdf] ${name}: ${Math.round(now - last)} ms`)
    last = now
  }

  report(0, 100)(0)
  const songs = await fetchSongs(input)
  phase("dades")
  report(0, 100)(5)
  const parts = await buildBookParts(input.title, input.style, input.accentColor, songs, input.options)
  phase("html")
  const frame = await createBookFrame(parts, input.options, input.style, opts.debug ?? false)
  phase("frame")
  try {
    report(0, 100)(15)
    const layout = await paginate(frame, input.options, input.title, report(15, 45))
    phase(`paginació (${layout.pages.length} pàgines)`)
    const bytes = await writePdf(frame, layout, { title: input.title }, report(45, 97))
    phase("escriptura")
    report(0, 100)(100)
    return new Blob([bytes as BlobPart], { type: "application/pdf" })
  } finally {
    frame.destroy()
  }
}

export type { PdfClientInput } from "./types"
