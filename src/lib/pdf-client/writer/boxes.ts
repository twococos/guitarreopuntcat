import { alphaOpt, borderAlphaOpt, parseColor, toX, toY, PX_TO_PT, type PageCtx, type Rgba } from "./context"

/**
 * Fons i vores d'una caixa. Subconjunt suportat (és el que fan servir
 * song.css, song-styles.css i el CSS del frame):
 *   · background-color, amb alfa
 *   · background-image: linear-gradient(...) (rasteritzat via canvas)
 *   · vores solid i double per costat, border-radius uniforme
 * La resta (box-shadow, filtres…) s'ignora conscientment.
 */

type Side = "Top" | "Right" | "Bottom" | "Left"
const SIDES: Side[] = ["Top", "Right", "Bottom", "Left"]

interface Border {
  width: number
  style: string
  color: Rgba | null
}

function readBorder(cs: CSSStyleDeclaration, side: Side): Border {
  const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`)
  const width = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0
  const color = parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`))
  return { width: style === "none" || style === "hidden" ? 0 : width, style, color }
}

/** Camí SVG d'un rectangle arrodonit amb origen (0,0), en px. */
function roundedPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (rr === 0) return `M0 0 H${w} V${h} H0 Z`
  return (
    `M${rr} 0 H${w - rr} A${rr} ${rr} 0 0 1 ${w} ${rr} V${h - rr} ` +
    `A${rr} ${rr} 0 0 1 ${w - rr} ${h} H${rr} A${rr} ${rr} 0 0 1 0 ${h - rr} ` +
    `V${rr} A${rr} ${rr} 0 0 1 ${rr} 0 Z`
  )
}

function fillRect(ctx: PageCtx, left: number, top: number, w: number, h: number, c: Rgba, opacity: number): void {
  if (w <= 0 || h <= 0) return
  ctx.page.drawRectangle({
    x: toX(ctx, left),
    y: toY(ctx, top + h),
    width: w * PX_TO_PT,
    height: h * PX_TO_PT,
    color: c.color,
    ...alphaOpt(c.alpha * opacity),
  })
}

/** Una tira de vora (o dues, si és double) al costat indicat. */
function drawSideStrip(ctx: PageCtx, rect: DOMRect, side: Side, b: Border, opacity: number): void {
  if (!b.color || b.width <= 0) return
  const strips: Array<[number, number]> =
    b.style === "double" ? [[0, b.width / 3], [(b.width * 2) / 3, b.width / 3]] : [[0, b.width]]
  for (const [offset, w] of strips) {
    switch (side) {
      case "Top":
        fillRect(ctx, rect.left, rect.top + offset, rect.width, w, b.color, opacity)
        break
      case "Bottom":
        fillRect(ctx, rect.left, rect.bottom - offset - w, rect.width, w, b.color, opacity)
        break
      case "Left":
        fillRect(ctx, rect.left + offset, rect.top, w, rect.height, b.color, opacity)
        break
      case "Right":
        fillRect(ctx, rect.right - offset - w, rect.top, w, rect.height, b.color, opacity)
        break
    }
  }
}

/* ── Degradats ───────────────────────────────────────────── */

interface Gradient {
  angleDeg: number
  stops: Array<{ color: string; pos: number }>
}

/** Interpreta un `linear-gradient(<angle>, <color> <pos>%, …)` computat. */
function parseLinearGradient(value: string): Gradient | null {
  const m = /linear-gradient\((.*)\)\s*$/.exec(value)
  if (!m) return null
  // Separem per comes de primer nivell (els colors porten comes internes).
  const args: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of m[1]) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      args.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) args.push(cur.trim())
  let angleDeg = 180
  if (args[0] && /deg$/.test(args[0])) angleDeg = parseFloat(args.shift() ?? "180")
  const stops = args.map((a, i) => {
    const pm = /^(.*\))\s+([\d.]+)%$/.exec(a)
    return pm
      ? { color: pm[1], pos: parseFloat(pm[2]) / 100 }
      : { color: a, pos: args.length > 1 ? i / (args.length - 1) : 0 }
  })
  return stops.length > 0 ? { angleDeg, stops } : null
}

async function drawGradient(ctx: PageCtx, rect: DOMRect, value: string, opacity: number): Promise<void> {
  const g = parseLinearGradient(value)
  if (!g) return
  // Resolució baixa: un degradat suau no la necessita.
  const scale = 0.5
  const w = Math.max(1, Math.round(rect.width * scale))
  const h = Math.max(1, Math.round(rect.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const c2d = canvas.getContext("2d")
  if (!c2d) return
  // Línia de degradat de CSS: angle des de "to top" en sentit horari.
  const a = (g.angleDeg * Math.PI) / 180
  const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
  const cx = w / 2
  const cy = h / 2
  const dx = (Math.sin(a) * len) / 2
  const dy = (-Math.cos(a) * len) / 2
  const grad = c2d.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  for (const s of g.stops) grad.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color)
  c2d.fillStyle = grad
  c2d.fillRect(0, 0, w, h)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"))
  if (!blob) return
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const img = await ctx.images.getOrCreate(`gradient:${value}:${w}x${h}`, async () => bytes)
  ctx.page.drawImage(img, {
    x: toX(ctx, rect.left),
    y: toY(ctx, rect.bottom),
    width: rect.width * PX_TO_PT,
    height: rect.height * PX_TO_PT,
    ...alphaOpt(opacity),
  })
}

/* ── Entrada ─────────────────────────────────────────────── */

export async function paintBox(el: Element, cs: CSSStyleDeclaration, ctx: PageCtx, opacity: number): Promise<void> {
  const bg = parseColor(cs.backgroundColor)
  const bgImage = cs.backgroundImage
  const hasGradient = bgImage !== "none" && bgImage.includes("linear-gradient")
  // Sortida ràpida: la gran majoria d'elements no tenen ni fons ni vores.
  const anyBorder =
    parseFloat(cs.borderTopWidth) > 0 ||
    parseFloat(cs.borderRightWidth) > 0 ||
    parseFloat(cs.borderBottomWidth) > 0 ||
    parseFloat(cs.borderLeftWidth) > 0
  if (!bg && !hasGradient && !anyBorder) return
  const borders = SIDES.map((s) => readBorder(cs, s))
  const hasBorder = borders.some((b) => b.width > 0 && b.color)
  if (!bg && !hasGradient && !hasBorder) return

  const rects =
    cs.display === "inline" ? Array.from(el.getClientRects()) : [el.getBoundingClientRect()]
  const radius = parseFloat(cs.borderTopLeftRadius) || 0

  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue

    if (hasGradient) await drawGradient(ctx, rect, bgImage, opacity)

    if (bg) {
      if (radius > 0) {
        ctx.page.drawSvgPath(roundedPath(rect.width, rect.height, radius), {
          x: toX(ctx, rect.left),
          y: toY(ctx, rect.top),
          scale: PX_TO_PT,
          color: bg.color,
          ...alphaOpt(bg.alpha * opacity),
        })
      } else {
        fillRect(ctx, rect.left, rect.top, rect.width, rect.height, bg, opacity)
      }
    }

    if (!hasBorder) continue
    const [t] = borders
    const uniform = borders.every(
      (b) => b.width === t.width && b.style === t.style && b.color?.color === t.color?.color,
    )
    if (radius > 0 && uniform && t.color && t.style === "solid") {
      // Vora arrodonida: traç centrat a mitja amplada cap endins.
      const bw = t.width
      ctx.page.drawSvgPath(roundedPath(rect.width - bw, rect.height - bw, radius - bw / 2), {
        x: toX(ctx, rect.left + bw / 2),
        y: toY(ctx, rect.top + bw / 2),
        scale: PX_TO_PT,
        borderColor: t.color.color,
        borderWidth: bw,
        ...borderAlphaOpt(t.color.alpha * opacity),
      })
    } else {
      SIDES.forEach((side, i) => drawSideStrip(ctx, rect, side, borders[i], opacity))
    }
  }
}
