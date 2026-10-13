import { clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from "pdf-lib"
import { alphaOpt, isPng, toX, toY, PX_TO_PT, type PageCtx } from "./context"

/**
 * `<img>` → imatge PDF. Suporta `object-fit: fill | contain | cover |
 * scale-down` (centrat).
 *
 * Les imatges s'incrusten amb els bytes ORIGINALS sempre que es pot: per a
 * `cover`, la imatge sencera es dibuixa més gran i es retalla amb un camí
 * de clip del PDF, sense passar per canvas (que recodifica, perd qualitat
 * i a WebKit pot multiplicar la mida). Només els PNG molt més grans del
 * que es mostren es redueixen, perquè no inflin cada PDF.
 */

/** Resolució màxima respecte a la mida mostrada (px CSS) abans de reduir. */
const MAX_OVERSAMPLE = 4

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No s'ha pogut baixar la imatge ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function canvasPng(img: HTMLImageElement, w: number, h: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const c2d = canvas.getContext("2d")
  if (!c2d) throw new Error("Canvas no disponible")
  c2d.imageSmoothingQuality = "high"
  c2d.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"))
  if (!blob) throw new Error("No s'ha pogut codificar la imatge")
  return new Uint8Array(await blob.arrayBuffer())
}

export async function drawImageEl(img: HTMLImageElement, cs: CSSStyleDeclaration, ctx: PageCtx, opacity: number): Promise<void> {
  const rect = img.getBoundingClientRect()
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (rect.width <= 0 || rect.height <= 0 || nw === 0 || nh === 0) return
  const url = img.currentSrc || img.src

  // Rectangle on es dibuixa la imatge SENCERA (px CSS) i, si cal, retall.
  let dst = { left: rect.left, top: rect.top, w: rect.width, h: rect.height }
  let clipRect: DOMRect | null = null
  if (cs.objectFit === "cover") {
    const s = Math.max(rect.width / nw, rect.height / nh)
    const w = nw * s
    const h = nh * s
    dst = { left: rect.left + (rect.width - w) / 2, top: rect.top + (rect.height - h) / 2, w, h }
    clipRect = rect
  } else if (cs.objectFit === "contain" || cs.objectFit === "scale-down") {
    const s = Math.min(rect.width / nw, rect.height / nh, cs.objectFit === "scale-down" ? 1 : Infinity)
    const w = nw * s
    const h = nh * s
    dst = { left: rect.left + (rect.width - w) / 2, top: rect.top + (rect.height - h) / 2, w, h }
  }

  const maxW = dst.w * MAX_OVERSAMPLE
  const shrink = nw > maxW * 1.5
  const key = shrink ? `${url}@${Math.round(maxW)}` : url
  const pdfImg = await ctx.images.getOrCreate(key, async () => {
    const original = await fetchBytes(url)
    const isJpeg = original[0] === 0xff && original[1] === 0xd8
    if (isJpeg) return original
    // pdf-lib només accepta PNG i JPEG: la resta (i els PNG enormes) via canvas.
    if (isPng(original) && !shrink) return original
    return shrink ? canvasPng(img, maxW, (maxW * nh) / nw) : canvasPng(img, nw, nh)
  })

  if (clipRect) {
    ctx.page.pushOperators(
      pushGraphicsState(),
      rectangle(
        toX(ctx, clipRect.left),
        toY(ctx, clipRect.bottom),
        clipRect.width * PX_TO_PT,
        clipRect.height * PX_TO_PT,
      ),
      clip(),
      endPath(),
    )
  }
  ctx.page.drawImage(pdfImg, {
    x: toX(ctx, dst.left),
    y: toY(ctx, dst.top + dst.h),
    width: dst.w * PX_TO_PT,
    height: dst.h * PX_TO_PT,
    ...alphaOpt(opacity),
  })
  if (clipRect) ctx.page.pushOperators(popGraphicsState())
}
