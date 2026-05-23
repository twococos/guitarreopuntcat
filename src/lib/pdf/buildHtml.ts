import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildPdfStyles } from "./styles"
import { renderSongHtml } from "@/components/song/SongView"
import { transposeKey } from "@/lib/transpose"
import {
  type CanconerStyle,
  type PdfOptions,
  FONT_SCALE_FACTORS,
} from "@/lib/schemas/canconer"

export interface PdfSong {
  title: string
  artist: string
  key: string
  capo: number | null
  content: string
  semitones: number
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Llegeix la imatge per defecte de portada (lazy a cada PDF perquè
 * permet substituir-la sense reiniciar el servidor). Retorna data
 * URL en base64. Si no existeix, retorna cadena buida i el HTML
 * omet el `<img>` gracefully.
 */
function loadCoverImageDataUrl(): string {
  try {
    const path = join(process.cwd(), "public", "img", "cover-default.jpg")
    const buf = readFileSync(path)
    return `data:image/jpeg;base64,${buf.toString("base64")}`
  } catch {
    return ""
  }
}

/**
 * Genera l'HTML complet del cançoner per Puppeteer.
 * Estructura condicional: [portada] → [índex] → pàgines de cançons.
 *
 * Cada cançó es renderitza amb `renderSongHtml()` (compartit amb
 * el component React <SongView />) per garantir que el PDF i el
 * frontend mai no es desincronitzen.
 *
 * L'atribut `data-style` viatja al `<body>` perquè els selectors
 * `[data-style="X"]` de song-styles.css apliquin tant al component
 * com a la portada i l'índex.
 */
export function buildHtml(
  title: string,
  style: CanconerStyle,
  accentColor: string | null,
  songs: PdfSong[],
  options: PdfOptions,
): string {
  const safeTitle = escHtml(title)
  const date = new Date().toLocaleDateString("ca-ES")

  // ── Portada (full-bleed amb caixa semitransparent centrada) ─
  const coverHtml = options.show_cover
    ? (() => {
        const coverImg = loadCoverImageDataUrl()
        const imgTag = coverImg ? `<img class="cover-img" src="${coverImg}" alt="">` : ""
        const coverClass = coverImg ? "cover" : "cover no-img"
        const subtitleHtml = options.cover_subtitle
          ? `<p class="cover-subtitle">${escHtml(options.cover_subtitle)}</p>`
          : ""
        return `
  <div class="${coverClass}">
    ${imgTag}
    <div class="cover-overlay">
      <h1>${safeTitle}</h1>
      ${subtitleHtml}
      <p class="cover-date">Generat el ${date}</p>
    </div>
  </div>`
      })()
    : ""

  // ── Índex ───────────────────────────────────────────
  // L'última cel·la conté una "ancla TOC" buida (.toc-anchor) que el
  // post-procés de pdf-lib utilitza per saber on dibuixar el número
  // de pàgina de cada cançó. El número real l'omple pdf-lib després.
  const tocHtml = options.show_index
    ? (() => {
        const rows = songs
          .map((s, i) => {
            const displayKey = transposeKey(s.key, s.semitones)
            const id = `song-${i + 1}`
            return (
              `<tr>` +
              `<td class="toc-num">${i + 1}</td>` +
              `<td><a class="toc-link" href="#${id}">${escHtml(s.title)}</a></td>` +
              `<td>${escHtml(s.artist)}</td>` +
              `<td>${escHtml(displayKey)}</td>` +
              `<td class="toc-page"><span class="toc-anchor" data-song-id="${i + 1}"></span></td>` +
              `</tr>`
            )
          })
          .join("")
        return `
  <div class="toc">
    <h2>Índex</h2>
    <table><tbody>${rows}</tbody></table>
  </div>`
      })()
    : ""

  // ── Cançons ─────────────────────────────────────────
  // El <span class="song-anchor"> permet al post-procés saber a quina
  // pàgina del PDF cau cada cançó (per omplir els números del TOC).
  const pages = songs
    .map(
      (s, i) =>
        `<section class="song-page" id="song-${i + 1}">` +
        `<span class="song-anchor" data-song-id="${i + 1}"></span>` +
        renderSongHtml({
          title: s.title,
          artist: s.artist,
          key: s.key,
          content: s.content,
          capo: s.capo,
          semitones: s.semitones,
          number: i + 1,
          styleVariant: style,
          accentColor,
        }) +
        `</section>`,
    )
    .join("")

  // ── Variables CSS i classes globals ─────────────────
  const fontScale = FONT_SCALE_FACTORS[options.font_scale]
  const inlineVars = [
    accentColor ? `--accent: ${accentColor}` : "",
    `--pdf-cols: ${options.columns}`,
    `--pdf-font-scale: ${fontScale}`,
  ]
    .filter(Boolean)
    .join("; ")

  const bodyClasses = [
    options.page_breaks ? "with-breaks" : "no-breaks",
    options.book_format ? "book-format" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<style>${buildPdfStyles(title, options)}</style>
</head>
<body class="${bodyClasses}" data-style="${style}" style="${inlineVars}">
  ${coverHtml}
  ${tocHtml}
  ${pages}
</body>
</html>`
}
