import "server-only"
import puppeteer from "puppeteer"
import type { PdfOptions, CanconerStyle } from "@/lib/schemas/canconer"
import { addHeaderFooter } from "./headerFooter"
import { HEADER_AREA_MM, FOOTER_AREA_MM } from "./styles"

export interface SongAnchor {
  songId: number
  /** Pàgina del PDF on cau (1-indexed). */
  page: number
}

export interface TocAnchor {
  songId: number
  /** Pàgina del PDF on cau l'ancla del TOC. */
  page: number
  /** Coordenades de l'ancla en punts PDF (origen bottom-left). */
  x: number
  y: number
}

/**
 * Genera el PDF en dues passes:
 *
 *   1. Puppeteer carrega l'HTML, captura les coordenades/pàgines de
 *      les ancles del TOC i de cada cançó, i genera el PDF amb @page.
 *   2. pdf-lib post-processa el PDF dibuixant capçaleres, peus de
 *      pàgina i els números de pàgina dins del TOC.
 */
export async function generatePdf(
  html: string,
  options: PdfOptions,
  title: string,
  hasCover: boolean,
  styleVariant: CanconerStyle,
  accentColor: string | null,
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  })
  let pdfBytes: Uint8Array
  let songAnchors: SongAnchor[] = []
  let tocAnchors: TocAnchor[] = []
  let tocPagesCount = 0
  try {
    const page = await browser.newPage()
    await page.emulateMediaType("print")

    // Fixem el viewport a l'amplada útil de A4 menys marges. Així el
    // càlcul d'alçada de pàgina al browser coincideix amb el del PDF
    // que Puppeteer generarà amb preferCSSPageSize.
    const MM_PX = 96 / 25.4 // 1mm a 96dpi
    const usableHeightMm =
      297 - options.margin_top - HEADER_AREA_MM - options.margin_bottom - FOOTER_AREA_MM
    const usableWidthMm = 210 - options.margin_left - options.margin_right
    const usableHeightPx = usableHeightMm * MM_PX
    const usableWidthPx = usableWidthMm * MM_PX

    await page.setViewport({
      width: Math.round(usableWidthPx),
      height: Math.round(usableHeightPx),
    })
    await page.setContent(html, { waitUntil: "networkidle0" })

    // Capturem informació per saber a quina pàgina del PDF cau cada
    // element. Com que `page-break-before: always` no es reflecteix al
    // layout HTML, simulem el "page-break" en JS:
    //   · Cada `.song-page` té `page-break-before: always` (amb breaks)
    //     o no (sense breaks).
    //   · Calculem l'alçada renderitzada de cada `.song-page` i, a la
    //     vegada, l'arrosseguem a un nombre enter de pàgines útils.
    //   · Així obtenim la pàgina d'inici de cada cançó.
    //   · El TOC també l'incloem per saber a quina pàgina cau l'ancla
    //     i en quina posició Y dins la pàgina.
    const measure = await page.evaluate(
      (args: { hasCover: boolean; usableHeightPx: number; hasBreaks: boolean }) => {
        const { hasCover, usableHeightPx, hasBreaks } = args

        const tocEl = document.querySelector(".toc") as HTMLElement | null
        const songPages = Array.from(
          document.querySelectorAll<HTMLElement>(".song-page"),
        )

        // ── Calcular pàgina d'inici de cada bloc ──
        // Layout simulat: portada (si n'hi ha) → TOC (1+ pàg) → cançons
        let nextPage = 1 // primera pàgina disponible (1-indexed)

        // Portada: 1 pàgina exacta
        if (hasCover) nextPage += 1

        // TOC: ocupa 1+ pàgines segons alçada renderitzada
        // (no té break forçat entre files; només page-break-after).
        let tocStartPage = nextPage
        let tocPagesCount = 1
        if (tocEl) {
          const tocHeight = tocEl.getBoundingClientRect().height
          tocPagesCount = Math.max(1, Math.ceil(tocHeight / usableHeightPx))
          nextPage += tocPagesCount
        }

        // Cançons: amb page_breaks=true, cada cançó comença en pàgina
        // nova i pot ocupar 1+ pàgines.
        // Sense page_breaks, totes les cançons flueixen contigues.
        const songStartPages = new Map<number, number>()
        if (hasBreaks) {
          for (const songEl of songPages) {
            const songId = Number(
              (songEl.querySelector(".song-anchor") as HTMLElement)?.dataset
                .songId,
            )
            songStartPages.set(songId, nextPage)
            const songHeight = songEl.getBoundingClientRect().height
            const songPagesUsed = Math.max(
              1,
              Math.ceil(songHeight / usableHeightPx),
            )
            nextPage += songPagesUsed
          }
        } else {
          // Sense breaks: les cançons són contigues. Calculem la
          // pàgina d'inici amb offsets acumulats.
          const songsContainerTop = songPages[0]?.getBoundingClientRect().top ?? 0
          for (const songEl of songPages) {
            const songId = Number(
              (songEl.querySelector(".song-anchor") as HTMLElement)?.dataset
                .songId,
            )
            const offsetWithinSongs =
              songEl.getBoundingClientRect().top - songsContainerTop
            const pageWithinSongs = Math.floor(offsetWithinSongs / usableHeightPx)
            songStartPages.set(songId, nextPage + pageWithinSongs)
          }
        }

        // ── songAnchors ──
        const songAnchors: Array<{ songId: number; page: number }> = []
        for (const [songId, page] of songStartPages) {
          songAnchors.push({ songId, page })
        }

        // ── tocAnchors ──
        // Per a cada ancla, calculem a quina pàgina del TOC cau (basant-nos
        // en la posició Y dins del TOC) i la seva Y relativa.
        const tocAnchorsResult: Array<{
          songId: number
          page: number
          x: number
          y: number
        }> = []
        if (tocEl) {
          const tocTop = tocEl.getBoundingClientRect().top
          const tocAnchorEls =
            document.querySelectorAll<HTMLElement>(".toc-anchor")
          tocAnchorEls.forEach((el) => {
            const rect = el.getBoundingClientRect()
            const offsetWithinToc = rect.top - tocTop
            const pageWithinToc = Math.floor(offsetWithinToc / usableHeightPx)
            const yWithinPage =
              offsetWithinToc - pageWithinToc * usableHeightPx
            tocAnchorsResult.push({
              songId: Number(el.dataset.songId),
              page: tocStartPage + pageWithinToc,
              x: rect.left,
              y: yWithinPage,
            })
          })
        }

        return {
          songAnchors,
          tocAnchors: tocAnchorsResult,
          tocPagesCount,
          tocStartPage,
        }
      },
      { hasCover, usableHeightPx, hasBreaks: options.page_breaks },
    )

    songAnchors = measure.songAnchors
    tocAnchors = measure.tocAnchors
    tocPagesCount = measure.tocPagesCount

    const raw = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    })
    pdfBytes = new Uint8Array(raw)
  } finally {
    await browser.close()
  }

  const finalBytes = await addHeaderFooter(pdfBytes, title, options, hasCover, {
    songAnchors,
    tocAnchors,
    tocPagesCount: tocPagesCount,
    styleVariant,
    accentColor,
  })
  return Buffer.from(finalBytes)
}
