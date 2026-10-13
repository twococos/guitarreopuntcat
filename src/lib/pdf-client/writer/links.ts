import { PDFHexString, PDFName, PDFString, type PDFDocument, type PDFRef } from "pdf-lib"
import { A4_PT, PX_TO_PT, type PendingLink } from "./context"

/**
 * Enllaços i marcadors del PDF.
 *   · `href="http…"` → anotació Link amb acció URI.
 *   · `href="#id"`   → anotació Link amb destinació a la pàgina i alçada
 *     on ha caigut l'element (índex → cançó).
 *   · Marcadors (outline) amb una entrada per cançó.
 */

export interface Destination {
  pageIdx: number
  /** Alçada en punts PDF (origen a baix). */
  top: number
}

/** Localitza un element de l'iframe dins de les pàgines paginades. */
export function destinationOf(el: Element, pageEls: HTMLElement[]): Destination | null {
  const pageEl = el.closest(".pdf-page")
  const pageIdx = pageEls.findIndex((p) => p === pageEl)
  if (pageIdx < 0 || !pageEl) return null
  const top = el.getBoundingClientRect().top - pageEl.getBoundingClientRect().top
  return { pageIdx, top: A4_PT[1] - Math.max(0, top) * PX_TO_PT }
}

export function addLinks(
  pdf: PDFDocument,
  pageRefs: PDFRef[],
  links: PendingLink[],
  resolveAnchor: (id: string) => Destination | null,
): void {
  const ctx = pdf.context
  const pages = pdf.getPages()
  for (const link of links) {
    const base = {
      Type: "Annot",
      Subtype: "Link",
      Rect: link.rect,
      Border: [0, 0, 0],
    }
    let dict
    if (link.href.startsWith("#")) {
      const dest = resolveAnchor(decodeURIComponent(link.href.slice(1)))
      if (!dest) continue
      dict = ctx.obj({ ...base, Dest: [pageRefs[dest.pageIdx], "XYZ", null, dest.top, null] })
    } else if (/^(https?:|mailto:)/i.test(link.href)) {
      dict = ctx.obj({
        ...base,
        A: { Type: "Action", S: "URI", URI: PDFString.of(link.href) },
      })
    } else {
      continue
    }
    pages[link.pageIdx].node.addAnnot(ctx.register(dict))
  }
}

export function addOutline(
  pdf: PDFDocument,
  pageRefs: PDFRef[],
  entries: Array<{ title: string; dest: Destination }>,
): void {
  if (entries.length === 0) return
  const ctx = pdf.context
  const outlineRef = ctx.nextRef()
  const refs = entries.map(() => ctx.nextRef())
  entries.forEach((e, i) => {
    const dict = ctx.obj({
      Title: PDFHexString.fromText(e.title),
      Parent: outlineRef,
      Dest: [pageRefs[e.dest.pageIdx], "XYZ", null, e.dest.top, null],
    })
    if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1])
    if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1])
    ctx.assign(refs[i], dict)
  })
  ctx.assign(
    outlineRef,
    ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }),
  )
  pdf.catalog.set(PDFName.of("Outlines"), outlineRef)
}
