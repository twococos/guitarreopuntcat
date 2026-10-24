import { alphaOpt, borderAlphaOpt, parseColor, toX, toY, PX_TO_PT, type PageCtx } from "./context"

/**
 * SVG inline → camins vectorials PDF. Cobreix `<path>` i `<rect>` amb
 * fill/stroke, que és el que genera la llibreria `qrcode` per als QR.
 * Respecta el viewBox amb `preserveAspectRatio` per defecte (meet, centrat).
 */
export function drawSvgEl(svg: SVGSVGElement, ctx: PageCtx, opacity: number): void {
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const vb = svg.viewBox.baseVal
  const vbW = vb && vb.width > 0 ? vb.width : rect.width
  const vbH = vb && vb.height > 0 ? vb.height : rect.height
  const s = Math.min(rect.width / vbW, rect.height / vbH)
  const offX = (rect.width - vbW * s) / 2 - (vb ? vb.x * s : 0)
  const offY = (rect.height - vbH * s) / 2 - (vb ? vb.y * s : 0)

  const shapes = svg.querySelectorAll<SVGElement>("path, rect")
  shapes.forEach((el) => {
    let d: string | null
    if (el.tagName.toLowerCase() === "rect") {
      const n = (a: string) => parseFloat(el.getAttribute(a) ?? "0") || 0
      const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")]
      d = `M${x} ${y} H${x + w} V${y + h} H${x} Z`
    } else {
      d = el.getAttribute("d")
    }
    if (!d) return
    const cs = ctx.win.getComputedStyle(el)
    const fill = cs.fill === "none" ? null : parseColor(cs.fill)
    const stroke = cs.stroke === "none" ? null : parseColor(cs.stroke)
    if (!fill && !stroke) return
    const strokeWidth = parseFloat(cs.strokeWidth) || 1
    ctx.page.drawSvgPath(d, {
      x: toX(ctx, rect.left + offX),
      y: toY(ctx, rect.top + offY),
      scale: s * PX_TO_PT,
      ...(fill ? { color: fill.color, ...alphaOpt(fill.alpha * opacity) } : {}),
      ...(stroke
        ? // El gruix és en unitats del viewBox: s'escala com el camí.
          { borderColor: stroke.color, borderWidth: strokeWidth * s * PX_TO_PT, ...borderAlphaOpt(stroke.alpha * opacity) }
        : {}),
    })
  })
}
