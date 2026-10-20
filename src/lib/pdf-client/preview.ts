import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"
import type { CanconerEntry } from "@/types/song"
import { buildBookParts } from "./html"
import { createBookFrame, PAGE_H_PX, PREVIEW_GAP_PX, type BookFrame } from "./frame"
import { paginate } from "./paginate"
import type { PdfSong } from "./types"

/**
 * Vista prèvia del llibret a l'editor de cançoners.
 *
 * Mateix pipeline que el PDF (html → frame → paginate) però sense
 * l'escriptor: l'iframe paginat es queda visible dins `mount`. Així la
 * prèvia és exactament el que es descarregarà (portada i índex inclosos).
 * No importa pdf-lib.
 */

export interface PreviewBuild {
  frame: BookFrame
  /** Alçada total (px CSS, sense escalar) del llibret dins l'iframe. */
  height: number
  /** Posició vertical (px, sense escalar) de l'inici de cada cançó (0-based). */
  songTops: number[]
  /** Posició de la primera pàgina de l'índex, o null si no n'hi ha. */
  tocTop: number | null
  pageCount: number
}

export interface PreviewInput {
  title: string
  style: CanconerStyle
  accentColor: string | null
  options: PdfOptions
  songs: PdfSong[]
}

/** Marge per sobre d'una cançó que comença a mitja pàgina, perquè se'n vegi el títol. */
const SONG_TOP_MARGIN_PX = 16

/** Les cançons del store són tal com les retorna l'API (snake_case),
 *  encara que el tipus `Song` digui camelCase. */
export function entriesToPdfSongs(entries: CanconerEntry[]): PdfSong[] {
  return entries.map(({ song, semitones }) => {
    const raw = song as unknown as {
      title: string
      artist: string
      key: string
      capo: number | null
      content: string
      album: string | null
      year: number | null
      youtube_url: string | null
      spotify_url: string | null
    }
    return {
      title: raw.title,
      artist: raw.artist,
      key: raw.key,
      capo: raw.capo ?? null,
      content: raw.content ?? "",
      semitones,
      album: raw.album ?? null,
      year: raw.year ?? null,
      youtubeUrl: raw.youtube_url ?? null,
      spotifyUrl: raw.spotify_url ?? null,
    }
  })
}

export async function buildPreview(input: PreviewInput, mount: HTMLElement): Promise<PreviewBuild> {
  const { options } = input
  const parts = await buildBookParts(input.title, input.style, input.accentColor, input.songs, options)
  const frame = await createBookFrame(parts, options, input.style, "preview", mount)
  try {
    const layout = await paginate(frame, options, input.title)
    // Totes les pàgines fan 297mm: les posicions surten del número de pàgina.
    const pageStep = PAGE_H_PX + PREVIEW_GAP_PX
    const height = Math.ceil(layout.pages.length * pageStep)
    frame.iframe.style.height = `${height}px`

    const songTops: number[] = []
    for (let i = 0; i < input.songs.length; i++) {
      const start = layout.songStarts.get(i + 1)
      if (!start) {
        songTops.push(songTops[songTops.length - 1] ?? 0)
        continue
      }
      const page = layout.pages[start.pageIdx]
      const pageTop = start.pageIdx * pageStep
      if (page.content.firstElementChild === start.el) {
        songTops.push(pageTop)
      } else {
        const offset = start.el.getBoundingClientRect().top - page.el.getBoundingClientRect().top
        songTops.push(Math.max(pageTop, pageTop + offset - SONG_TOP_MARGIN_PX))
      }
    }
    const tocIdx = layout.pages.findIndex((pg) => pg.kind === "toc")
    const tocTop = tocIdx === -1 ? null : tocIdx * pageStep
    return { frame, height, songTops, tocTop, pageCount: layout.pages.length }
  } catch (err) {
    frame.destroy()
    throw err
  }
}
