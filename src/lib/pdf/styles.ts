import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PdfOptions } from "@/lib/schemas/canconer"

/**
 * CSS injectat dins de l'HTML generat per al PDF.
 *
 * Combina:
 *   · src/styles/song.css        → estils base del component
 *   · src/styles/song-styles.css → variants d'estil del cançoner
 *   · PDF_BOOK_CSS               → portada, índex, columnes, page-breaks
 *   · regles @page dinàmiques    → marges
 */

const SONG_CSS_RAW = readFileSync(
  join(process.cwd(), "src", "styles", "song.css"),
  "utf8",
)

const SONG_STYLES_CSS = readFileSync(
  join(process.cwd(), "src", "styles", "song-styles.css"),
  "utf8",
)

const SONG_CSS = SONG_CSS_RAW.replace(/@import\s+["'][^"']*song-styles\.css["']\s*;?/g, "")

const PDF_BOOK_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--song-title-font, "Georgia", serif);
  color: #222;
}

/* ── Portada full-bleed (sense marges) ─────────────────── */
/* Usem una "named page" CSS perquè la portada no tingui marges
   mentre la resta del PDF sí. Chromium suporta @page named-page. */
.cover {
  page: cover;
  position: relative;
  width: 210mm;
  height: 297mm;
  page-break-after: always;
  overflow: hidden;
  margin: 0;
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
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}
.cover-overlay h1 {
  font-family: var(--song-title-font, "Georgia", serif);
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
.cover-overlay .cover-date {
  font-size: 0.9rem;
  color: #555;
}
/* Sense imatge: degradat subtil i caixa més opaca */
.cover.no-img {
  background: linear-gradient(135deg, #f4f4f0 0%, #e9e7e0 100%);
}
.cover.no-img .cover-overlay {
  background: rgba(255, 255, 255, 0.95);
}

/* ── Índex ─────────────────────────────────────────────── */
/* Després del TOC SEMPRE salta a pàgina nova, independentment
   de si les cançons tenen salts entre elles. */
.toc { padding-top: 2rem; page-break-after: always; }
/* L'amaguem el .toc-anchor; només existeix per fixar coordenades. */
.toc-anchor { display: inline-block; width: 0; height: 0; }
.song-anchor { display: inline-block; width: 0; height: 0; }
.toc h2 {
  font-family: var(--song-title-font, "Georgia", serif);
  color: var(--accent);
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
}
.toc table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  font-family: var(--song-body-font, "Courier New", monospace);
}
.toc td { padding: 6px 8px; border-bottom: 1px solid #eee; }
.toc td.toc-num { width: 2rem; color: #999; }
.toc td.toc-page { width: 3.5rem; text-align: right; }
.toc a.toc-link {
  color: inherit;
  text-decoration: none;
}
/* Els números del TOC es dibuixen al post-procés amb pdf-lib
   a la posició de .toc-anchor. Aquí només deixem espai. */
.toc td.toc-page { min-width: 3rem; }

/* ── Cançons: salts de pàgina ──────────────────────────── */
.song-page { padding-top: 1rem; }
body.with-breaks .song-page { page-break-before: always; }
body.no-breaks .song-page:not(:first-child) {
  page-break-before: auto;
  margin-top: 2rem;
}

/* ── Columnes i mida de lletra ─────────────────────────── */
/* IMPORTANT: les columnes s'apliquen només al .song-body (la part
   de la lletra), no a tot el .song — el header amb número/títol
   sempre va a tota amplada. */
.song-page .song-body {
  column-count: var(--pdf-cols, 1);
  column-fill: balance;
  column-gap: 1.2rem;
}
/* Font-scale: sobreescrivim la variable que ja consumeix .song-body.
   Sense això, la regla original de song.css guanya per especificitat. */
.song-page .song {
  --song-body-size: calc(0.9rem * var(--pdf-font-scale, 1));
}

/* Evita que els acords/títols es tallin entre columnes/pàgines */
.song-page .song-head { break-inside: avoid; }
.song-page .song-body sec { break-inside: avoid; }

/* El QR i els enllaços del títol viuen a song.css (format compartit). */
`

/**
 * Construeix el CSS final per a un PDF concret.
 * Inclou les regles @page (marges).
 *
 * NOTA sobre les capçaleres/peus de "format llibre":
 *   No s'implementen amb @page :left/:right + @top-left perquè Chromium
 *   no renderitza els marginals (@top-*, @bottom-*) en mode PDF de Puppeteer.
 *   En lloc d'això, generate.ts usa displayHeaderFooter + headerTemplate /
 *   footerTemplate de Puppeteer, que sí funcionen i exposen el pageNumber.
 */
/**
 * Espai reservat dalt/baix per a la capçalera/peu de pàgina (sempre).
 * Es suma als marges de l'usuari perquè el contingut no trepitgi
 * la zona on pdf-lib pintarà el header/footer.
 */
const HEADER_AREA_MM = 12
const FOOTER_AREA_MM = 10

export function buildPdfStyles(_title: string, options: PdfOptions): string {
  const top = options.margin_top + HEADER_AREA_MM
  const bottom = options.margin_bottom + FOOTER_AREA_MM
  const pageCss = `
@page {
  size: A4;
  margin-top: ${top}mm;
  margin-right: ${options.margin_right}mm;
  margin-bottom: ${bottom}mm;
  margin-left: ${options.margin_left}mm;
}
@page cover {
  size: A4;
  margin: 0;
}
`
  return SONG_CSS + SONG_STYLES_CSS + PDF_BOOK_CSS + pageCss
}

export { HEADER_AREA_MM, FOOTER_AREA_MM }
