import { PDF_STYLES } from "./styles"
import { renderSongHtml } from "@/components/song/SongView"
import { transposeKey } from "@/lib/transpose"
import type { CanconerStyle } from "@/lib/schemas/canconer"

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
 * Genera l'HTML complet del cançoner per Puppeteer.
 * Estructura: portada → índex → pàgina per cançó.
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
): string {
  const safeTitle = escHtml(title)
  const date = new Date().toLocaleDateString("ca-ES")

  const tocRows = songs
    .map((s, i) => {
      const displayKey = transposeKey(s.key, s.semitones)
      return `<tr><td>${i + 1}</td><td>${escHtml(s.title)}</td><td>${escHtml(s.artist)}</td><td>${escHtml(displayKey)}</td></tr>`
    })
    .join("")

  const pages = songs
    .map(
      (s, i) =>
        `<section class="song-page">${renderSongHtml({
          title: s.title,
          artist: s.artist,
          key: s.key,
          content: s.content,
          capo: s.capo,
          semitones: s.semitones,
          number: i + 1,
          styleVariant: style,
          accentColor,
        })}</section>`,
    )
    .join("")

  const bodyStyleAttr = accentColor
    ? ` style="--accent: ${accentColor}"`
    : ""

  return `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="UTF-8">
<style>${PDF_STYLES}</style>
</head>
<body data-style="${style}"${bodyStyleAttr}>

  <div class="cover">
    <h1>${safeTitle}</h1>
    <p>Generat el ${date}</p>
  </div>

  <div class="toc">
    <h2>Índex</h2>
    <table>${tocRows}</table>
  </div>

  ${pages}

</body>
</html>`
}
