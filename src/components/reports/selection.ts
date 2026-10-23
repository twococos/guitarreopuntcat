/**
 * src/components/reports/selection.ts — Selecció de lletra sobre el markup dels reports
 * (`.rp-line[data-b]`, `.rp-t[data-o]`, vegeu src/lib/reports/render.ts).
 *
 * La fan servir el mode correcció dels reports (ReportableSongBody) i la goma de l'arranjador
 * ràpid (QuickArrangeDialog): selecció per paraules senceres, caixetes que la dibuixen i el
 * cursor d'inserció. Només navegador.
 */

export const WORD_CHAR = /[\p{L}\p{N}'’·-]/u

export interface Pos {
  block: number
  offset: number
  /** Posició dins el text que ha afegit l'ítem `item` d'aquest report (no és al content). */
  ins?: { item: number; offset: number }
}

export interface Sel {
  block: number
  start: number
  end: number
  text: string
}

/** Node i offset de text sota un punt de la pantalla. */
export function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  const r = d.caretRangeFromPoint?.(x, y)
  return r ? { node: r.startContainer, offset: r.startOffset } : null
}

/** Límits de la paraula que conté `offset` (o null si no n'hi ha cap). */
export function wordBounds(text: string, offset: number): { start: number; end: number } | null {
  let start = Math.min(offset, text.length)
  let end = start
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  return start === end ? null : { start, end }
}

/**
 * Cursor (en coordenades del contenidor) a una posició de text: la vora
 * esquerra del caràcter que hi ha a l'offset, o la dreta de l'últim si és al
 * final. Si la línia no té text, al principi de la línia.
 */
export function caretBox(wrap: HTMLElement, pos: Pos) {
  const origin = wrap.getBoundingClientRect()
  const selector = pos.ins
    ? `ins[data-item="${pos.ins.item}"] .rp-it`
    : `.rp-line[data-b="${pos.block}"] .rp-t`
  const offset = pos.ins ? pos.ins.offset : pos.offset
  let fallback: { left: number; top: number; height: number } | null = null
  for (const t of wrap.querySelectorAll<HTMLElement>(selector)) {
    const node = t.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE) continue
    const o = Number(t.dataset.o)
    const len = node.textContent?.length ?? 0
    if (offset < o || offset > o + len || len === 0) continue
    const r = document.createRange()
    const atEnd = offset === o + len
    r.setStart(node, atEnd ? len - 1 : offset - o)
    r.setEnd(node, atEnd ? len : offset - o + 1)
    const rect = [...r.getClientRects()].find((c) => c.width > 0)
    if (!rect) continue
    const box = { left: (atEnd ? rect.right : rect.left) - origin.left, top: rect.top - origin.top, height: rect.height }
    if (!atEnd) return box
    fallback = box
  }
  if (fallback) return fallback
  const line = pos.ins
    ? wrap.querySelector<HTMLElement>(`ins[data-item="${pos.ins.item}"]`)
    : wrap.querySelector<HTMLElement>(`.rp-line[data-b="${pos.block}"]`)
  if (!line) return null
  const r = line.getBoundingClientRect()
  return { left: r.left - origin.left, top: r.top - origin.top, height: r.height || 16 }
}

/**
 * Caixetes de la selecció de lletra, en coordenades del contenidor: una per
 * línia visual (una línia de la cançó pot ocupar-ne més d'una en pantalla).
 * Només es mesuren els trossos de text, no els acords que hi ha a sobre.
 * `scope`: on es busca la línia (si el mateix bloc surt més d'un cop, el tros que toca).
 */
export function selectionBoxes(wrap: HTMLElement, sel: Sel, scope: HTMLElement = wrap) {
  const origin = wrap.getBoundingClientRect()
  const rects: DOMRect[] = []
  for (const t of scope.querySelectorAll<HTMLElement>(`.rp-line[data-b="${sel.block}"] .rp-t`)) {
    const node = t.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE) continue
    const o = Number(t.dataset.o)
    const s = Math.max(sel.start, o)
    const e = Math.min(sel.end, o + (node.textContent?.length ?? 0))
    if (s >= e) continue
    const r = document.createRange()
    r.setStart(node, s - o)
    r.setEnd(node, e - o)
    for (const cr of r.getClientRects()) if (cr.width > 0.5) rects.push(cr)
  }
  const lines: { left: number; right: number; top: number; bottom: number }[] = []
  for (const r of rects) {
    const l = lines.find((b) => Math.abs(b.top - r.top) < r.height / 2)
    if (l) {
      l.left = Math.min(l.left, r.left)
      l.right = Math.max(l.right, r.right)
      l.bottom = Math.max(l.bottom, r.bottom)
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
    }
  }
  return lines.map((b) => ({
    left: b.left - origin.left - 3,
    top: b.top - origin.top - 1,
    width: b.right - b.left + 6,
    height: b.bottom - b.top + 2,
  }))
}
