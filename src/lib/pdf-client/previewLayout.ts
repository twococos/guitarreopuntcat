import { PAGE_H_PX, PAGE_W_PX, PREVIEW_GAP_PX, type BookFrame } from "./frame"

/* Disposició de la vista prèvia (1, 2, 4 o 8 columnes de pàgines). Mòdul lleuger:
 * el component el fa servir en cada canvi de zoom sense carregar el
 * paginador. */

/** Inici d'una cançó dins el llibret: pàgina i desplaçament dins la pàgina. */
export interface PagePos {
  pageIdx: number
  /** px CSS (sense escalar) des de dalt de la pàgina. */
  offset: number
}

export interface PreviewBuild {
  frame: BookFrame
  /** Inici de cada cançó (0-based). */
  songStarts: PagePos[]
  /** Primera pàgina de l'índex, o null si no n'hi ha. */
  tocPage: number | null
  pageCount: number
}

/** Columnes possibles, de més gran a més petita. */
export const PREVIEW_COLS = [8, 4, 2, 1] as const

/** Zoom mínim (relatiu a «ajusta a l'amplada»): on hi caben just 8 pàgines. */
export const PREVIEW_MIN_ZOOM = PAGE_W_PX / (8 * PAGE_W_PX + 7 * PREVIEW_GAP_PX)

/** Llibret disposat en `cols` columnes de pàgines (1, 2, 4 o 8). */
export interface PreviewLayout {
  cols: number
  /** Mode llibre amb més d'una columna: la primera pàgina va sola a la
   *  dreta, perquè cada parella de columnes sigui un plec. */
  spreadOffset: number
  width: number
  height: number
}

/** Amplada i alçada (px CSS, sense escalar) del llibret en `cols` columnes. */
export function previewLayout(pageCount: number, cols: number, bookFormat: boolean): PreviewLayout {
  const spreadOffset = cols > 1 && bookFormat ? 1 : 0
  const rows = Math.max(1, Math.ceil((pageCount + spreadOffset) / cols))
  return {
    cols,
    spreadOffset,
    width: Math.ceil(cols * PAGE_W_PX + (cols - 1) * PREVIEW_GAP_PX),
    height: Math.ceil(rows * (PAGE_H_PX + PREVIEW_GAP_PX)),
  }
}

/** Posició vertical (px, sense escalar) d'una pàgina + desplaçament. */
export function previewTop(pos: PagePos, layout: PreviewLayout): number {
  const row = Math.floor((pos.pageIdx + layout.spreadOffset) / layout.cols)
  return row * (PAGE_H_PX + PREVIEW_GAP_PX) + pos.offset
}

/** Aplica la disposició a l'iframe de la prèvia (sense tornar a paginar:
 *  les pàgines fan sempre 210×297mm, només es recol·loquen). */
export function applyPreviewLayout(build: PreviewBuild, layout: PreviewLayout): void {
  const { iframe, doc } = build.frame
  doc.body.style.setProperty("--preview-cols", String(layout.cols))
  doc.body.classList.toggle("pdf-preview-spread", layout.spreadOffset > 0)
  iframe.style.width = `${layout.width}px`
  iframe.style.height = `${layout.height}px`
}
