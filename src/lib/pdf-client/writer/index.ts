import { PDFDocument } from "pdf-lib"
import type { BookFrame } from "../frame"
import type { BookLayout } from "../paginate"
import type { ProgressFn } from "../types"
import { A4_PT, FontCache, ImageCache, toX, toY, type PageCtx, type PendingLink } from "./context"
import { fastFontkit } from "./fastFontkit"
import { drawTextNode } from "./text"
import { paintBox } from "./boxes"
import { drawImageEl } from "./images"
import { drawSvgEl } from "./svg"
import { addLinks, addOutline, destinationOf } from "./links"

/**
 * Escriptor DOM → PDF.
 *
 * El navegador ja ho ha maquetat tot dins l'iframe (columnes, acords,
 * salts de línia, fonts). Aquí només ho "calquem": recorrem cada pàgina
 * en ordre de document i, per a cada element, llegim on és
 * (getBoundingClientRect / Range.getClientRects) i com és
 * (getComputedStyle), i ho traduïm a ordres de dibuix de pdf-lib.
 *
 * L'ordre de pintat és el del DOM (fons i vores de l'element, després
 * els fills), que és el que fem servir: no hi ha z-index que el contradigui.
 */

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "BR"])

async function walk(el: Element, ctx: PageCtx, parentOpacity: number): Promise<void> {
  if (SKIP_TAGS.has(el.tagName)) return
  const cs = ctx.win.getComputedStyle(el)
  if (cs.display === "none") return
  const ownOpacity = parseFloat(cs.opacity)
  const opacity = parentOpacity * (Number.isNaN(ownOpacity) ? 1 : ownOpacity)
  if (opacity <= 0) return

  if (cs.visibility === "visible") await paintBox(el, cs, ctx, opacity)

  const tag = el.tagName.toLowerCase()
  if (tag === "img") {
    if (cs.visibility === "visible") await drawImageEl(el as HTMLImageElement, cs, ctx, opacity)
    return
  }
  if (tag === "svg") {
    if (cs.visibility === "visible") drawSvgEl(el as SVGSVGElement, ctx, opacity)
    collectLink(el, ctx)
    return
  }
  collectLink(el, ctx)

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) await drawTextNode(child as Text, ctx, opacity)
    else if (child.nodeType === Node.ELEMENT_NODE) await walk(child as Element, ctx, opacity)
  }
}

function collectLink(el: Element, ctx: PageCtx): void {
  if (el.tagName !== "A") return
  const href = el.getAttribute("href")
  if (!href) return
  for (const r of Array.from(el.getClientRects())) {
    if (r.width <= 0 || r.height <= 0) continue
    ctx.links.push({
      pageIdx: ctx.pageIdx,
      rect: [toX(ctx, r.left), toY(ctx, r.bottom), toX(ctx, r.right), toY(ctx, r.top)],
      href,
    })
  }
}

export async function writePdf(
  frame: BookFrame,
  layout: BookLayout,
  meta: { title: string },
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fastFontkit)
  pdf.setTitle(meta.title, { showInWindowTitleBar: true })
  pdf.setCreator("guitarreo.cat")
  pdf.setProducer("guitarreo.cat")
  pdf.setLanguage("ca-ES")

  const fonts = new FontCache(pdf, frame.doc)
  const images = new ImageCache(pdf)
  const links: PendingLink[] = []
  const win = frame.doc.defaultView
  if (!win) throw new Error("Frame del PDF sense finestra")

  const pageEls = layout.pages.map((p) => p.el)
  for (let i = 0; i < layout.pages.length; i++) {
    const pageEl = pageEls[i]
    const page = pdf.addPage(A4_PT)
    const origin = pageEl.getBoundingClientRect()
    const ctx: PageCtx = {
      pdf,
      page,
      pageIdx: i,
      originX: origin.left,
      originY: origin.top,
      fonts,
      images,
      links,
      win,
    }
    await walk(pageEl, ctx, 1)
    onProgress?.(((i + 1) / layout.pages.length) * 100)
    if (i % 3 === 2) await nextFrame()
  }

  const pageRefs = pdf.getPages().map((p) => p.ref)
  addLinks(pdf, pageRefs, links, (id) => {
    const el = frame.doc.getElementById(id)
    return el ? destinationOf(el, pageEls) : null
  })

  const outline: Array<{ title: string; dest: { pageIdx: number; top: number } }> = []
  for (const [, start] of Array.from(layout.songStarts.entries()).sort((a, b) => a[0] - b[0])) {
    const title = start.el.querySelector(".song-title")?.textContent?.trim() ?? ""
    const dest = destinationOf(start.el, pageEls)
    if (title && dest) outline.push({ title, dest })
  }
  addOutline(pdf, pageRefs, outline)

  return pdf.save()
}

