import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"
import { buildBookParts } from "./html"
import { createBookFrame } from "./frame"
import { applyPreviewLayout, previewLayout, type PagePos, type PreviewBuild } from "./previewLayout"
import { paginate } from "./paginate"
import type { PdfSong } from "./types"

export { entriesToPdfSongs } from "./songs"

/**
 * Vista prèvia del llibret a l'editor de cançoners.
 *
 * Mateix pipeline que el PDF (html → frame → paginate) però sense
 * l'escriptor: l'iframe paginat es queda visible dins `mount`. Així la
 * prèvia és exactament el que es descarregarà (portada i índex inclosos).
 * No importa pdf-lib.
 */

export type { PagePos, PreviewBuild, PreviewLayout } from "./previewLayout"
export { previewLayout, previewTop, applyPreviewLayout } from "./previewLayout"

export interface PreviewInput {
  title: string
  style: CanconerStyle
  accentColor: string | null
  options: PdfOptions
  songs: PdfSong[]
}

/** Marge per sobre d'una cançó que comença a mitja pàgina, perquè se'n vegi el títol. */
const SONG_TOP_MARGIN_PX = 16

export async function buildPreview(input: PreviewInput, mount: HTMLElement): Promise<PreviewBuild> {
  const { options } = input
  const parts = await buildBookParts(input.title, input.style, input.accentColor, input.songs, options)
  const frame = await createBookFrame(parts, options, input.style, "preview", mount)
  try {
    const layout = await paginate(frame, options, input.title)
    // Espai buit per al mode llibre a dues columnes (vegeu frame.ts)
    const spacer = frame.doc.createElement("div")
    spacer.className = "pdf-preview-spacer"
    frame.pagesRoot.prepend(spacer)

    const songStarts: PagePos[] = []
    for (let i = 0; i < input.songs.length; i++) {
      const start = layout.songStarts.get(i + 1)
      if (!start) {
        songStarts.push(songStarts[songStarts.length - 1] ?? { pageIdx: 0, offset: 0 })
        continue
      }
      const page = layout.pages[start.pageIdx]
      if (page.content.firstElementChild === start.el) {
        songStarts.push({ pageIdx: start.pageIdx, offset: 0 })
      } else {
        const offset = start.el.getBoundingClientRect().top - page.el.getBoundingClientRect().top
        songStarts.push({ pageIdx: start.pageIdx, offset: Math.max(0, offset - SONG_TOP_MARGIN_PX) })
      }
    }
    const tocIdx = layout.pages.findIndex((pg) => pg.kind === "toc")
    const build: PreviewBuild = {
      frame,
      songStarts,
      tocPage: tocIdx === -1 ? null : tocIdx,
      pageCount: layout.pages.length,
    }
    applyPreviewLayout(build, previewLayout(build.pageCount, 1, options.book_format))
    return build
  } catch (err) {
    frame.destroy()
    throw err
  }
}
