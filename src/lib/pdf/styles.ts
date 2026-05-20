import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * CSS injectat dins de l'HTML generat per al PDF.
 *
 * Combina:
 *   · src/styles/song.css     → estils dels tags <ch> i <sec>
 *                                (font única; també l'usa globals.css
 *                                via @import).
 *   · constants locals        → portada, índex i pàgina de cançó (només PDF)
 *
 * Es llegeix amb fs.readFileSync al moment d'import perquè
 *   (1) no podem importar CSS al runtime de Node, i
 *   (2) volem una sola font de veritat per als tags semàntics.
 *
 * El `next.config.mjs` té `serverExternalPackages` per `puppeteer`,
 * així que aquesta lectura passa al servidor Node natiu.
 */

const SONG_CSS = readFileSync(
  join(process.cwd(), "src", "styles", "song.css"),
  "utf8",
)

const PDF_BOOK_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: "Georgia", serif;
  color: #222;
}

.cover {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  page-break-after: always;
}
.cover h1 { font-size: 2.8rem; margin-bottom: 1rem; }
.cover p  { font-size: 1rem; color: #666; }

.toc { page-break-after: always; padding-top: 2rem; }
.toc h2 { font-size: 1.6rem; margin-bottom: 1.5rem; }
.toc table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
.toc td { padding: 6px 8px; border-bottom: 1px solid #eee; }
.toc td:first-child { width: 2rem; color: #999; }
.toc td:last-child  { width: 4rem; text-align: right; color: #555; }

.song-page  { page-break-before: always; }
.song-title { font-size: 1.8rem; margin-bottom: 0.3rem; }
.song-meta  { font-size: 0.85rem; color: #777; margin-bottom: 1.5rem; }
.song-content {
  font-family: "Courier New", monospace;
  font-size: 0.9rem;
  line-height: 1.7;
  white-space: pre-wrap;
}
`

export const PDF_STYLES = SONG_CSS + PDF_BOOK_CSS
