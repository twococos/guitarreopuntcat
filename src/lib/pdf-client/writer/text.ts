import { setCharacterSpacing, setCharacterSqueeze } from "pdf-lib"
import { matchFontFace, type FontFaceDef } from "../fonts"
import { alphaOpt, parseColor, toX, toY, PX_TO_PT, type PageCtx, type Rgba } from "./context"

/**
 * Pinta un node de text tal com l'ha col·locat el navegador.
 *
 * Per cada línia visual que ocupa el node (normalment una), dibuixem el
 * tros de text a la posició exacta que dona `Range.getClientRects()`.
 * Com que cada node comença a la seva posició mesurada (i els acords són
 * nodes propis), l'error de mètriques mai s'acumula entre acord i lletra.
 * A més, si l'amplada calculada amb la font difereix lleugerament de la
 * mesurada (kerning, arrodoniments), l'ajustem amb escalat horitzontal.
 */

interface Segment {
  start: number
  end: number
  rect: DOMRect
}

const WS = /\s/

function unionRect(rects: DOMRect[]): DOMRect {
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  for (const x of rects) {
    l = Math.min(l, x.left)
    t = Math.min(t, x.top)
    r = Math.max(r, x.right)
    b = Math.max(b, x.bottom)
  }
  return new DOMRect(l, t, r - l, b - t)
}

/**
 * Caixes visibles d'un rang. NO es fa servir `range.getBoundingClientRect()`:
 * si el rang comença just a l'inici d'una línia partida, WebKit hi afegeix
 * una caixa d'amplada zero al final de la línia ANTERIOR, i el rectangle
 * envoltant agafa el `top` d'una línia i el `left` de l'altra.
 */
function visibleRects(range: Range): DOMRect[] {
  return Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
}

/** Trossos del node per línia visual, sense espais als extrems. */
function lineSegments(node: Text, doc: Document): Segment[] {
  const raw = node.data
  let s = 0
  let e = raw.length
  while (s < e && WS.test(raw[s])) s++
  while (e > s && WS.test(raw[e - 1])) e--
  if (s >= e) return []

  const range = doc.createRange()
  range.setStart(node, s)
  range.setEnd(node, e)
  const rects = visibleRects(range)
  if (rects.length === 0) return []
  const top0 = rects[0].top
  if (rects.every((r) => Math.abs(r.top - top0) < 1)) {
    return [{ start: s, end: e, rect: unionRect(rects) }]
  }

  // El node ocupa diverses línies: agrupem paraules per línia.
  const groups: Array<{ start: number; end: number; top: number; height: number }> = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    range.setStart(node, m.index)
    range.setEnd(node, m.index + m[0].length)
    const wordRects = visibleRects(range)
    if (wordRects.length === 0) continue
    const r = unionRect(wordRects)
    const last = groups[groups.length - 1]
    if (last && Math.abs(r.top - last.top) < last.height / 2) {
      last.end = m.index + m[0].length
    } else {
      groups.push({ start: m.index, end: m.index + m[0].length, top: r.top, height: r.height })
    }
  }
  return groups.map((g) => {
    range.setStart(node, g.start)
    range.setEnd(node, g.end)
    return { start: g.start, end: g.end, rect: unionRect(visibleRects(range)) }
  })
}

/** Estil de text d'un element, llegit una sola vegada (un element pot tenir
 *  molts nodes de text: una línia amb acords en té un per tros). */
interface TextStyle {
  color: Rgba | null
  face: FontFaceDef
  sizePx: number
  preserveSpaces: boolean
  transform: string
  letterSpacingPx: number
}

const styleCache = new WeakMap<Element, TextStyle | null>()

function textStyle(el: Element, win: Window): TextStyle | null {
  const cached = styleCache.get(el)
  if (cached !== undefined) return cached
  const cs = win.getComputedStyle(el)
  const style: TextStyle | null =
    cs.visibility !== "visible"
      ? null
      : {
          color: parseColor(cs.color),
          face: matchFontFace(cs.fontFamily, Number(cs.fontWeight) || 400, cs.fontStyle),
          sizePx: parseFloat(cs.fontSize),
          preserveSpaces: cs.whiteSpace.startsWith("pre") || cs.whiteSpace === "break-spaces",
          transform: cs.textTransform,
          letterSpacingPx: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0,
        }
  styleCache.set(el, style)
  return style
}

export async function drawTextNode(node: Text, ctx: PageCtx, opacity: number): Promise<void> {
  const parent = node.parentElement
  if (!parent) return
  const style = textStyle(parent, ctx.win)
  if (!style || !style.color) return
  const { color, face, sizePx, preserveSpaces, letterSpacingPx } = style

  const segments = lineSegments(node, parent.ownerDocument)
  if (segments.length === 0) return

  const font = await ctx.fonts.get(face)
  const ascent = ctx.fonts.ascent(face)
  const sizePt = sizePx * PX_TO_PT
  const alpha = color.alpha * opacity

  for (const seg of segments) {
    let text = node.data.slice(seg.start, seg.end)
    if (!preserveSpaces) text = text.replace(/\s+/g, " ")
    if (style.transform === "uppercase") text = text.toLocaleUpperCase("ca")
    else if (style.transform === "lowercase") text = text.toLocaleLowerCase("ca")
    text = text.replace(/[\t\n\r]/g, " ")

    const x = toX(ctx, seg.rect.left)
    const y = toY(ctx, seg.rect.top + ascent * sizePx)

    // Escalat horitzontal per absorbir petites diferències d'amplada.
    // No s'aplica amb letter-spacing (l'amplada mesurada ja l'inclou).
    let squeeze = 100
    if (letterSpacingPx === 0) {
      const computed = font.widthOfTextAtSize(text, sizePt)
      const measured = seg.rect.width * PX_TO_PT
      if (computed > 0) {
        const ratio = measured / computed
        if (Math.abs(ratio - 1) > 0.002 && Math.abs(ratio - 1) < 0.06) squeeze = ratio * 100
      }
    }

    if (letterSpacingPx !== 0) ctx.page.pushOperators(setCharacterSpacing(letterSpacingPx * PX_TO_PT))
    if (squeeze !== 100) ctx.page.pushOperators(setCharacterSqueeze(squeeze))
    ctx.page.drawText(text, {
      x,
      y,
      size: sizePt,
      font,
      color: color.color,
      ...alphaOpt(alpha),
    })
    if (squeeze !== 100) ctx.page.pushOperators(setCharacterSqueeze(100))
    if (letterSpacingPx !== 0) ctx.page.pushOperators(setCharacterSpacing(0))
  }
}
