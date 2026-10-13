import { rgb, type PDFDocument, type PDFFont, type PDFPage, type RGB } from "pdf-lib"
import { type FontFaceDef } from "../fonts"

/** 1 px CSS (96 dpi) = 0.75 pt PDF. */
export const PX_TO_PT = 0.75
/** A4 en punts PDF. */
export const A4_PT: [number, number] = [595.28, 841.89]

export interface PendingLink {
  pageIdx: number
  /** Rectangle en punts PDF (origen a baix a l'esquerra). */
  rect: [number, number, number, number]
  href: string
}

/** Estat compartit per tots els pintors d'una pàgina. */
export interface PageCtx {
  pdf: PDFDocument
  page: PDFPage
  pageIdx: number
  /** Cantonada superior esquerra de la pàgina dins l'iframe (px). */
  originX: number
  originY: number
  fonts: FontCache
  images: ImageCache
  links: PendingLink[]
  win: Window
}

export function toX(ctx: PageCtx, px: number): number {
  return (px - ctx.originX) * PX_TO_PT
}

/** Y del DOM (cap avall, px) → Y del PDF (cap amunt, pt). */
export function toY(ctx: PageCtx, px: number): number {
  return A4_PT[1] - (px - ctx.originY) * PX_TO_PT
}

/* ── Colors ──────────────────────────────────────────────── */

export interface Rgba {
  color: RGB
  alpha: number
}

const colorCache = new Map<string, Rgba | null>()
let probeCtx: CanvasRenderingContext2D | null = null

/**
 * Converteix un color computat a RGB de pdf-lib. Cobreix `rgb()/rgba()`
 * (el cas habitual) i `color(srgb …)` (com serialitzen els navegadors el
 * resultat de `color-mix()`); qualsevol altra forma es resol pintant un
 * píxel en un canvas i llegint-lo.
 */
export function parseColor(value: string): Rgba | null {
  const cached = colorCache.get(value)
  if (cached !== undefined) return cached
  let out: Rgba | null = null
  const v = value.trim()
  let m: RegExpExecArray | null
  if (v === "transparent" || v === "") {
    out = null
  } else if ((m = /^rgba?\(([^)]+)\)$/.exec(v))) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    const [r, g, b] = parts
    const a = parts.length > 3 ? parts[3] : 1
    out = { color: rgb(r / 255, g / 255, b / 255), alpha: a }
  } else if ((m = /^color\(srgb\s+([^)]+)\)$/.exec(v))) {
    const parts = m[1].split(/[\s/]+/).filter(Boolean).map(Number)
    const [r, g, b] = parts
    const a = parts.length > 3 ? parts[3] : 1
    out = { color: rgb(clamp01(r), clamp01(g), clamp01(b)), alpha: a }
  } else {
    out = parseViaCanvas(v)
  }
  if (out && out.alpha <= 0) out = null
  colorCache.set(value, out)
  return out
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function parseViaCanvas(v: string): Rgba | null {
  if (!probeCtx) {
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    probeCtx = c.getContext("2d", { willReadFrequently: true })
  }
  if (!probeCtx) return null
  probeCtx.clearRect(0, 0, 1, 1)
  probeCtx.fillStyle = "#000"
  probeCtx.fillStyle = v
  probeCtx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data
  if (a === 0) return null
  return { color: rgb(r / 255, g / 255, b / 255), alpha: a / 255 }
}

/* ── Fonts embegudes ─────────────────────────────────────── */

/**
 * Bytes de cada TTF, compartits entre generacions (no canvien mai).
 *
 * ⚠ Els TTF han d'estar normalitzats amb scripts/normalize-fonts.mjs: el
 * subset de @pdf-lib/fontkit perd glifs en silenci amb fonts amb hinting
 * si no ho estan (detalls a l'script).
 */
const fontBytes = new Map<string, Promise<ArrayBuffer>>()

function loadFontBytes(url: string): Promise<ArrayBuffer> {
  let p = fontBytes.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No s'ha pogut baixar la font ${url}`)
        return r.arrayBuffer()
      })
    p.catch(() => fontBytes.delete(url))
    fontBytes.set(url, p)
  }
  return p
}

export class FontCache {
  private embedded = new Map<string, Promise<PDFFont>>()
  /** Fracció d'ascendent (baseline des del capdamunt de la caixa de text). */
  private ascents = new Map<string, number>()

  constructor(
    private readonly pdf: PDFDocument,
    private readonly frameDoc: Document,
  ) {}

  get(face: FontFaceDef): Promise<PDFFont> {
    let p = this.embedded.get(face.url)
    if (!p) {
      p = loadFontBytes(face.url).then((bytes) => this.pdf.embedFont(bytes, { subset: true }))
      this.embedded.set(face.url, p)
    }
    return p
  }

  /**
   * Distància del capdamunt de la caixa de text a la línia base, com a
   * fracció de la mida de lletra, MESURADA al navegador. Cada plataforma
   * tria mètriques verticals diferents (hhea, typo, win), així que no es
   * pot calcular des del fitxer: ho preguntem al motor que ha maquetat.
   */
  ascent(face: FontFaceDef): number {
    const cached = this.ascents.get(face.url)
    if (cached !== undefined) return cached
    const doc = this.frameDoc
    const probe = doc.createElement("span")
    probe.style.cssText =
      `position:absolute;left:0;top:0;white-space:nowrap;line-height:normal;font-size:100px;` +
      `font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style}`
    const text = doc.createTextNode("Hg")
    const marker = doc.createElement("span")
    marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"
    probe.append(text, marker)
    doc.body.appendChild(probe)
    const range = doc.createRange()
    range.selectNodeContents(text)
    const textTop = range.getBoundingClientRect().top
    const baseline = marker.getBoundingClientRect().bottom
    probe.remove()
    const ratio = (baseline - textTop) / 100
    this.ascents.set(face.url, ratio)
    return ratio
  }
}

/* ── Imatges embegudes ───────────────────────────────────── */

export class ImageCache {
  private cache = new Map<string, Promise<import("pdf-lib").PDFImage>>()

  constructor(private readonly pdf: PDFDocument) {}

  getOrCreate(key: string, make: () => Promise<Uint8Array>): Promise<import("pdf-lib").PDFImage> {
    let p = this.cache.get(key)
    if (!p) {
      p = make().then((bytes) => (isPng(bytes) ? this.pdf.embedPng(bytes) : this.pdf.embedJpg(bytes)))
      this.cache.set(key, p)
    }
    return p
  }
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

/* ── Opacitat ────────────────────────────────────────────── */

/** pdf-lib crea un ExtGState NOU per a cada dibuix amb `opacity` (encara que
 *  valgui 1): només el passem quan hi ha transparència real. */
export function alphaOpt(a: number): { opacity?: number } {
  return a < 1 ? { opacity: a } : {}
}

export function borderAlphaOpt(a: number): { borderOpacity?: number } {
  return a < 1 ? { borderOpacity: a } : {}
}
