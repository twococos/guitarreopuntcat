import type { PdfOptions } from "@/lib/schemas/canconer"
import type { BookParts } from "./html"

/**
 * Iframe ocult on es maqueta el cançoner.
 *
 * L'iframe aïlla el CSS: dins només hi ha song.css + song-styles.css
 * (servits per /api/pdf/styles) i el CSS de llibre d'aquí sota, sense
 * globals.css. Tot el que el paginador mesura i l'escriptor copia al
 * PDF surt d'aquí, així que el que es veu a l'iframe ÉS el PDF.
 */

/** Espai entre la línia de la capçalera (o del peu) i el contingut. */
const RULE_GAP_MM = 3

/* Unitats: 1mm a 96 dpi. Les pàgines es maqueten en px CSS i l'escriptor
   passa a punts PDF (×0.75). */
export const MM_PX = 96 / 25.4
export const PAGE_W_PX = 210 * MM_PX
export const PAGE_H_PX = 297 * MM_PX
/** Separació (px) entre pàgines a la vista prèvia de l'editor. */
export const PREVIEW_GAP_PX = 24

/** hidden: generació del PDF · debug: iframe visible a sobre de tot ·
 *  preview: vista prèvia de l'editor, muntada dins `mount`. */
export type FrameMode = "hidden" | "debug" | "preview"

const FRAME_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body {
  font-family: var(--song-title-font, "Gelasio", serif);
  color: #222;
  font-synthesis: none;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
}

/* ── Pàgines ───────────────────────────────────────────── */
.pdf-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  overflow: hidden;
  background: #fff;
}
body.pdf-debug .pdf-page { margin: 0 auto 12px; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
body.pdf-debug { background: #888; padding: 12px 0; }
html:has(body.pdf-preview), body.pdf-preview { background: transparent; overflow: hidden; }
body.pdf-preview .pdf-page { margin: 0 0 ${PREVIEW_GAP_PX}px; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
/* El contingut comença just a sota de la línia de la capçalera i acaba
   just a sobre de la del peu (mateixes alçades que .pdf-header/.pdf-footer). */
.pdf-content {
  position: absolute;
  top: calc(max(calc(var(--pdf-mt) - 6pt), 30pt) + ${RULE_GAP_MM}mm);
  bottom: calc(max(calc(var(--pdf-mb) - 6pt), 30pt) + ${RULE_GAP_MM}mm);
  left: var(--pdf-ml);
  right: var(--pdf-mr);
}
/* Mode llibre: pàgina esquerra, marges interior/exterior emmirallats. */
.pdf-page.is-verso .pdf-content,
.pdf-page.is-verso .pdf-header,
.pdf-page.is-verso .pdf-footer {
  left: var(--pdf-mr);
  right: var(--pdf-ml);
}
/* Font de la maqueta: fora de la vista però amb l'amplada útil real,
   perquè els salts de línia coincideixin amb els de la pàgina. */
#pdf-staging {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(210mm - var(--pdf-ml) - var(--pdf-mr));
  visibility: hidden;
}

/* ── Capçalera i peu ───────────────────────────────────── */
/* Geometria heretada del PDF de servidor: línia de capçalera 6pt per
   sobre del marge superior i línia del peu 6pt per sota de l'inferior. */
.pdf-header, .pdf-footer {
  position: absolute;
  left: var(--pdf-ml);
  right: var(--pdf-mr);
  display: flex;
  justify-content: space-between;
  font-family: var(--song-title-font, "Gelasio", serif);
  font-size: 9pt;
  line-height: 1;
  color: #595959;
}
.pdf-header {
  top: 0;
  height: max(calc(var(--pdf-mt) - 6pt), 30pt);
  align-items: flex-end;
  border-bottom: 0.6pt solid #999;
  padding-bottom: 2pt;
}
.pdf-header.is-mirror { flex-direction: row-reverse; }
.pdf-h-title { font-weight: 700; color: var(--accent); padding-bottom: 7pt; }
.pdf-h-brand { display: flex; align-items: flex-end; gap: 4pt; }
.pdf-header.is-mirror .pdf-h-brand { flex-direction: row-reverse; }
.pdf-h-brand span { padding-bottom: 7pt; }
.pdf-h-brand img { height: 28pt; width: auto; display: block; }
.pdf-footer {
  bottom: 0;
  height: max(calc(var(--pdf-mb) - 6pt), 30pt);
  align-items: flex-start;
  justify-content: center;
  border-top: 0.6pt solid #999;
  padding-top: 5pt;
}
.pdf-footer.is-odd { justify-content: flex-end; }
.pdf-footer.is-even { justify-content: flex-start; }

/* ── Portada full-bleed ────────────────────────────────── */
.cover {
  position: relative;
  width: 210mm;
  height: 297mm;
  overflow: hidden;
}
.cover-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}
.cover-overlay {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.82);
  padding: 3rem 4rem;
  text-align: left;
  z-index: 1;
}
.cover-overlay h1 {
  font-family: var(--song-title-font, "Gelasio", serif);
  color: var(--accent);
  font-size: 3.2rem;
  margin-bottom: 0.6rem;
  line-height: 1.1;
}
.cover-overlay .cover-subtitle {
  font-size: 1.3rem;
  color: #333;
  margin-bottom: 0.8rem;
  font-style: italic;
}
.cover-overlay .cover-date { font-size: 0.9rem; color: #555; }
.cover.no-img { background: linear-gradient(135deg, #f4f4f0 0%, #e9e7e0 100%); }
.cover.no-img .cover-overlay { background: rgba(255, 255, 255, 0.95); }

/* ── Índex ─────────────────────────────────────────────── */
.toc { padding-top: 2rem; }
.toc.is-cont { padding-top: 0; }
.toc h2 {
  font-family: var(--song-title-font, "Gelasio", serif);
  color: var(--accent);
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
}
.toc table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  font-family: var(--song-body-font, "Cousine", monospace);
}
.toc td { padding: 6px 8px; border-bottom: 1px solid #eee; }
.toc td.toc-num { width: 2rem; color: #999; }
.toc td.toc-page {
  width: 3.5rem;
  text-align: right;
  font-family: var(--song-title-font, "Gelasio", serif);
  font-weight: 700;
  font-size: 10pt;
  color: var(--accent);
}
.toc a { color: inherit; text-decoration: none; }

/* ── Cançons ───────────────────────────────────────────── */
.song-page { padding-top: 1rem; }
.song-page.is-cont { padding-top: 0; }
.song-page.flow-next { margin-top: 2rem; }
.song-page .song-body {
  column-count: var(--pdf-cols, 1);
  column-gap: 1.2rem;
  column-fill: balance;
}
.song-page .song-body.is-fill { column-fill: auto; }
.song-page .song {
  --song-body-size: calc(0.9rem * var(--pdf-font-scale, 1));
}
.song-page .song-head { break-inside: avoid; }
.pdf-unit, .pdf-line { break-inside: avoid; }
.pdf-unit.is-dropped { display: none; }
/* Els guions de les seccions ja són text real (vegeu splitSongBody). */
sec::before, sec::after { content: none; }
.song-title-link, .song-qr { color: inherit; text-decoration: none; }
`

function marginVars(options: PdfOptions): string {
  return [
    `--pdf-mt: ${options.margin_top}mm`,
    `--pdf-mr: ${options.margin_right}mm`,
    `--pdf-mb: ${options.margin_bottom}mm`,
    `--pdf-ml: ${options.margin_left}mm`,
  ].join("; ")
}

export interface BookFrame {
  iframe: HTMLIFrameElement
  doc: Document
  staging: HTMLElement
  pagesRoot: HTMLElement
  destroy: () => void
}

function waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.addEventListener("load", () => resolve(), { once: true })
    iframe.addEventListener("error", () => reject(new Error("No s'ha pogut carregar el frame del PDF")), {
      once: true,
    })
  })
}

async function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images)
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((r) => {
          img.addEventListener("load", () => r(), { once: true })
          img.addEventListener("error", () => r(), { once: true })
        })
      }
      if (img.naturalWidth === 0) {
        // Imatge absent: la portada passa al degradat de reserva.
        const cover = img.closest(".cover")
        if (cover) cover.classList.add("no-img")
        img.remove()
        return
      }
      try {
        await img.decode()
      } catch {
        /* ja està carregada; decode() és només una optimització */
      }
    }),
  )
}

/**
 * Crea l'iframe amb totes les peces dins de `#pdf-staging` i espera que
 * CSS, imatges i fonts estiguin a punt (les mètriques de les fonts
 * determinen els salts de pàgina, així que no es pot paginar abans).
 */
export async function createBookFrame(
  parts: BookParts,
  options: PdfOptions,
  style: string,
  mode: FrameMode,
  mount: HTMLElement = document.body,
): Promise<BookFrame> {
  const debug = mode === "debug"
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.tabIndex = -1
  iframe.style.cssText =
    mode === "debug"
      ? "position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99999;background:#888"
      : mode === "preview"
        ? // L'alçada i l'escala les posa el component. Sense pointer-events,
          // la roda del ratolí va al contenidor de scroll del pare.
          `position:absolute;top:0;left:0;width:${Math.ceil(PAGE_W_PX)}px;height:${Math.ceil(PAGE_H_PX)}px;border:0;pointer-events:none;transform-origin:top left`
        : `position:fixed;left:-30000px;top:0;width:${Math.ceil(PAGE_W_PX) + 40}px;height:${Math.ceil(PAGE_H_PX)}px;border:0;visibility:hidden;pointer-events:none`

  const staging = [parts.coverHtml ?? "", parts.tocHtml ?? "", ...parts.songHtmls].join("\n")
  iframe.srcdoc = `<!DOCTYPE html>
<html lang="ca"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/api/pdf/styles">
<style>${FRAME_CSS}</style>
</head>
<body class="${parts.bodyClass}${debug ? " pdf-debug" : ""}${mode === "preview" ? " pdf-preview" : ""}" data-style="${style}" style="${parts.bodyStyle}; ${marginVars(options)}">
<div id="pdf-pages"></div>
<div id="pdf-staging">${staging}</div>
</body></html>`

  const loaded = waitForLoad(iframe)
  mount.appendChild(iframe)
  await loaded

  const doc = iframe.contentDocument
  if (!doc) throw new Error("Frame del PDF sense document")
  await waitForImages(doc)
  // Forcem layout perquè es disparin les càrregues de fonts i esperem-les.
  void doc.body.offsetHeight
  await doc.fonts.ready

  const stagingEl = doc.getElementById("pdf-staging")
  const pagesRoot = doc.getElementById("pdf-pages")
  if (!stagingEl || !pagesRoot) throw new Error("Frame del PDF incomplet")

  return {
    iframe,
    doc,
    staging: stagingEl,
    pagesRoot,
    destroy: () => {
      if (debug) {
        // En mode debug el frame queda visible; un doble clic el tanca.
        doc.addEventListener("dblclick", () => iframe.remove(), { once: true })
        return
      }
      iframe.remove()
    },
  }
}
