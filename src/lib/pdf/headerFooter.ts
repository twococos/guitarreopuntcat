import "server-only"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib"
import { type PdfOptions, type CanconerStyle, STYLE_DEFAULT_ACCENTS } from "@/lib/schemas/canconer"
import type { SongAnchor, TocAnchor } from "./generate"

/**
 * Post-processa un PDF generat per Puppeteer:
 *   - Afegeix capçalera i peu a totes les pàgines excepte la portada.
 *   - Dibuixa el número de pàgina de cada cançó al TOC.
 *   - Si `book_format`: insereix una pàgina blanca després del TOC
 *     si cal perquè la primera cançó caigui en pàgina senar (dreta).
 *
 * Layout per defecte de la capçalera:
 *   ┌──────────────────────────────────────────────┐
 *   │ Títol cançoner             guitarreo.cat 🎸 │
 *   │ ─────────────────────────────────────────── │
 *   └──────────────────────────────────────────────┘
 *
 * Layout per defecte del peu:
 *   ┌──────────────────────────────────────────────┐
 *   │ ─────────────────────────────────────────── │
 *   │                     42                       │
 *   └──────────────────────────────────────────────┘
 *
 * Mode llibre: a les pàgines parells s'inverteix (títol→dreta,
 * branding→esquerra) i el número de pàgina al peu va al costat
 * exterior (parell→esquerra, senar→dreta).
 */

const BRAND_TEXT = "guitarreo.cat"
const BRAND_LOGO_PATH = join(process.cwd(), "public", "img", "logo.png")

/** Mapeja l'estil del cançoner a una família de fonts PDF estàndard.
 *  pdf-lib ofereix Helvetica, TimesRoman i Courier; per a Bradley Hand
 *  (handwritten) no hi ha equivalent natiu, així que cau a TimesRoman.
 */
function fontPairForStyle(style: CanconerStyle): {
  regular: StandardFonts
  bold: StandardFonts
} {
  switch (style) {
    case "minimal":
    case "bold":
      return { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold }
    case "classic":
    case "serif":
    case "handwritten":
    case "compact":
    default:
      return { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold }
  }
}

function loadLogoBytes(): Buffer | null {
  try {
    return readFileSync(BRAND_LOGO_PATH)
  } catch {
    return null
  }
}

const MM_TO_PT = 2.83465 // 1 mm = 2.83465 pt
const PX_TO_PT = 0.75 // 1 px (96 dpi) = 0.75 pt

/** Converteix un color hex (#rgb o #rrggbb) a un objecte pdf-lib RGB. */
function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "")
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  }
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

export interface AddHeaderFooterExtras {
  songAnchors: SongAnchor[]
  tocAnchors: TocAnchor[]
  /** Nombre de pàgines del TOC al PDF original (sense blanca de paritat). */
  tocPagesCount: number
  styleVariant: CanconerStyle
  accentColor: string | null
}

export async function addHeaderFooter(
  pdfBytes: Uint8Array,
  title: string,
  options: PdfOptions,
  hasCover: boolean,
  extras: AddHeaderFooterExtras,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const fontPair = fontPairForStyle(extras.styleVariant)
  const font = await pdfDoc.embedFont(fontPair.regular)
  const fontBold = await pdfDoc.embedFont(fontPair.bold)

  // Logo (opcional)
  const logoBytes = loadLogoBytes()
  let logoImg: import("pdf-lib").PDFImage | null = null
  if (logoBytes) {
    try {
      logoImg = await pdfDoc.embedPng(logoBytes)
    } catch {
      logoImg = null
    }
  }

  // ── Pàgina blanca per ajustar paritat (mode llibre) ─────
  // Si book_format=ON i el TOC té un nombre senar de pàgines,
  // inserim una pàgina blanca DARRERE del TOC perquè la 1a cançó
  // caigui en pàgina senar (dreta a doble cara).
  let insertedBlankAfterToc = false
  let firstSongOriginalPage = 0
  if (extras.songAnchors.length > 0) {
    firstSongOriginalPage = Math.min(...extras.songAnchors.map((a) => a.page))
  }

  if (
    options.book_format &&
    options.show_index &&
    extras.tocPagesCount > 0 &&
    firstSongOriginalPage > 0
  ) {
    if (extras.tocPagesCount % 2 === 1) {
      // Inserim una pàgina blanca a la posició on començava la 1a cançó.
      // pdf-lib: insertPage(index) col·loca la nova a la posició `index`
      // (0-indexed). `firstSongOriginalPage` és 1-indexed → l'índex 0-indexed
      // d'on inserir-la és `firstSongOriginalPage - 1`.
      const [a4w, a4h] = [595.28, 841.89]
      pdfDoc.insertPage(firstSongOriginalPage - 1, [a4w, a4h])
      insertedBlankAfterToc = true
    }
  }

  // Ajusta les pàgines de cançó si s'ha inserit pàgina blanca.
  // El TOC i la portada no es mouen perquè la blanca va DESPRÉS.
  const songAnchorsAdjusted = extras.songAnchors.map((a) =>
    insertedBlankAfterToc ? { ...a, page: a.page + 1 } : a,
  )

  // Color del tema (accent custom o default del preset)
  const accentHex = extras.accentColor ?? STYLE_DEFAULT_ACCENTS[extras.styleVariant]
  const ACCENT = hexToRgb(accentHex)
  const TEXT_COLOR = rgb(0.35, 0.35, 0.35)
  const LINE_COLOR = rgb(0.6, 0.6, 0.6)
  const FONT_SIZE = 9
  const LOGO_HEIGHT = 28 // pt

  // Refresca pages (pot haver-se modificat amb la insertPage)
  const pages = pdfDoc.getPages()

  const marginLeftPt = options.margin_left * MM_TO_PT
  const marginRightPt = options.margin_right * MM_TO_PT
  const headerAreaTopPt = options.margin_top * MM_TO_PT
  const footerAreaBottomPt = options.margin_bottom * MM_TO_PT

  // Determinem la primera pàgina (0-indexed) on volem header/footer:
  // les pàgines de "front matter" (portada + TOC + blanca de paritat)
  // no porten ni capçalera ni número de pàgina. Comencem a numerar
  // des de la primera cançó.
  const firstSongFinalPage =
    songAnchorsAdjusted.length > 0
      ? Math.min(...songAnchorsAdjusted.map((a) => a.page))
      : hasCover
        ? 2
        : 1
  const startIdx = firstSongFinalPage - 1 // 1-indexed → 0-indexed

  // ── Capçaleres i peus a totes les pàgines de cançons ─────
  for (let i = startIdx; i < pages.length; i++) {
    const page = pages[i]
    const { width, height } = page.getSize()
    const pageNumber = i - startIdx + 1 // 1-indexed dins de pàgines numerades
    const isOdd = pageNumber % 2 === 1

    /* ── Capçalera ─────────────────────────────────────── */
    const headerY = height - headerAreaTopPt + 18
    const lineY = height - headerAreaTopPt + 6

    const titleOnLeft = !options.book_format || isOdd

    if (titleOnLeft) {
      page.drawText(title, {
        x: marginLeftPt,
        y: headerY,
        size: FONT_SIZE,
        font: fontBold,
        color: ACCENT,
      })
      drawBranding(page, font, logoImg, {
        rightEdge: width - marginRightPt,
        y: headerY,
        textColor: TEXT_COLOR,
        fontSize: FONT_SIZE,
        logoHeight: LOGO_HEIGHT,
      })
    } else {
      const titleWidth = fontBold.widthOfTextAtSize(title, FONT_SIZE)
      page.drawText(title, {
        x: width - marginRightPt - titleWidth,
        y: headerY,
        size: FONT_SIZE,
        font: fontBold,
        color: ACCENT,
      })
      drawBrandingLeft(page, font, logoImg, {
        leftEdge: marginLeftPt,
        y: headerY,
        textColor: TEXT_COLOR,
        fontSize: FONT_SIZE,
        logoHeight: LOGO_HEIGHT,
      })
    }

    page.drawLine({
      start: { x: marginLeftPt, y: lineY },
      end: { x: width - marginRightPt, y: lineY },
      thickness: 0.6,
      color: LINE_COLOR,
    })

    /* ── Peu de pàgina ─────────────────────────────────── */
    const footerLineY = footerAreaBottomPt - 6
    const footerTextY = footerAreaBottomPt - 18

    page.drawLine({
      start: { x: marginLeftPt, y: footerLineY },
      end: { x: width - marginRightPt, y: footerLineY },
      thickness: 0.6,
      color: LINE_COLOR,
    })

    const pageNumStr = String(pageNumber)
    const pageNumWidth = font.widthOfTextAtSize(pageNumStr, FONT_SIZE)

    let pageNumX: number
    if (options.book_format) {
      pageNumX = isOdd ? width - marginRightPt - pageNumWidth : marginLeftPt
    } else {
      pageNumX = (width - pageNumWidth) / 2
    }

    page.drawText(pageNumStr, {
      x: pageNumX,
      y: footerTextY,
      size: FONT_SIZE,
      font,
      color: TEXT_COLOR,
    })
  }

  // ── Números de pàgina al TOC ─────────────────────────────
  // Per cada toc-anchor, dibuixem el número de pàgina de la cançó
  // corresponent. La X la pren de la cel·la `.toc-page` (a la dreta
  // de la taula). Per l'alineació right, sumem l'ample disponible de
  // la cel·la i restem el width del text.
  for (const tocAnchor of extras.tocAnchors) {
    const songAnchor = songAnchorsAdjusted.find((s) => s.songId === tocAnchor.songId)
    if (!songAnchor) continue

    const pageIdx = tocAnchor.page - 1
    if (pageIdx < 0 || pageIdx >= pages.length) continue

    const page = pages[pageIdx]
    const { height: pageHeight, width: pageWidth } = page.getSize()

    // Y: tocAnchor.y ve en px (96dpi) i top-left (web). Convertim a pt
    // i a coordenades bottom-left (PDF). Sumem el header area (els
    // marges @page apliquen offset que getBoundingClientRect no veu).
    const headerAreaPt = (options.margin_top + 12) * MM_TO_PT // +HEADER_AREA_MM
    const yWebPt = tocAnchor.y * PX_TO_PT
    const yPdf = pageHeight - headerAreaPt - yWebPt - 3

    // El número que es mostra al TOC és el "número visible" de la
    // cançó (1, 2, 3...), no l'índex absolut al PDF. Coincideix amb
    // el número que es pintarà al footer de la pàgina de la cançó.
    const visiblePageNum = songAnchor.page - startIdx
    const pageNumStr = String(visiblePageNum)
    const TOC_FONT_SIZE = 10
    const numWidth = fontBold.widthOfTextAtSize(pageNumStr, TOC_FONT_SIZE)
    // X: l'ancla està a l'inici de la cel·la `.toc-page`. Volem el
    // número alineat al final de la cel·la (que coincideix amb el
    // marge dret). Posem el text a (xAncla + ampleCel·la - ampleText).
    // Convertim x web (px) a pt i alineem amb el marge dret.
    const rightEdgeX = pageWidth - marginRightPt
    page.drawText(pageNumStr, {
      x: rightEdgeX - numWidth,
      y: yPdf,
      size: TOC_FONT_SIZE,
      font: fontBold,
      color: ACCENT,
    })
  }

  return pdfDoc.save()
}

interface BrandingOpts {
  rightEdge: number
  y: number
  textColor: RGB
  fontSize: number
  logoHeight: number
}

interface BrandingLeftOpts {
  leftEdge: number
  y: number
  textColor: RGB
  fontSize: number
  logoHeight: number
}

function drawBranding(
  page: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
  logoImg: import("pdf-lib").PDFImage | null,
  opts: BrandingOpts,
) {
  const textWidth = font.widthOfTextAtSize(BRAND_TEXT, opts.fontSize)
  let x = opts.rightEdge

  if (logoImg) {
    const logoScale = opts.logoHeight / logoImg.height
    const logoW = logoImg.width * logoScale
    x -= logoW
    page.drawImage(logoImg, {
      x,
      y: opts.y - 10,
      width: logoW,
      height: opts.logoHeight,
    })
    x -= 4
  }

  x -= textWidth
  page.drawText(BRAND_TEXT, {
    x,
    y: opts.y,
    size: opts.fontSize,
    font,
    color: opts.textColor,
  })
}

function drawBrandingLeft(
  page: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
  logoImg: import("pdf-lib").PDFImage | null,
  opts: BrandingLeftOpts,
) {
  let x = opts.leftEdge

  if (logoImg) {
    const logoScale = opts.logoHeight / logoImg.height
    const logoW = logoImg.width * logoScale
    page.drawImage(logoImg, {
      x,
      y: opts.y - 10,
      width: logoW,
      height: opts.logoHeight,
    })
    x += logoW + 4
  }

  page.drawText(BRAND_TEXT, {
    x,
    y: opts.y,
    size: opts.fontSize,
    font,
    color: opts.textColor,
  })
}
