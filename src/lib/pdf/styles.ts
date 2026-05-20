import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * CSS injectat dins de l'HTML generat per al PDF.
 *
 * Combina:
 *   · src/styles/song.css        → estils base del component
 *   · src/styles/song-styles.css → variants d'estil del cançoner
 *   · constants locals           → portada, índex i page-break (només PDF)
 *
 * Es llegeix amb fs.readFileSync al moment d'import perquè
 *   (1) no podem importar CSS al runtime de Node, i
 *   (2) volem una sola font de veritat per al render de cançons.
 *
 * IMPORTANT: NO podem confiar en l'@import dins de song.css perquè
 * Puppeteer injecta l'HTML via setContent() sense una base URL, i
 * els @import relatius no es resolen. Per això concatenem els dos
 * fitxers aquí manualment i fem strip de la línia @import.
 *
 * El `next.config.mjs` té `serverExternalPackages` per `puppeteer`,
 * així que aquesta lectura passa al servidor Node natiu.
 */

const SONG_CSS_RAW = readFileSync(
  join(process.cwd(), "src", "styles", "song.css"),
  "utf8",
)

const SONG_STYLES_CSS = readFileSync(
  join(process.cwd(), "src", "styles", "song-styles.css"),
  "utf8",
)

// Elimina la línia `@import "./song-styles.css";` per evitar
// que el browser intenti carregar-la (i falli silenciosament).
const SONG_CSS = SONG_CSS_RAW.replace(/@import\s+["'][^"']*song-styles\.css["']\s*;?/g, "")

const PDF_BOOK_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--song-title-font, "Georgia", serif);
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
.cover h1 {
  font-family: var(--song-title-font, "Georgia", serif);
  color: var(--accent);
  font-size: 2.8rem;
  margin-bottom: 1rem;
}
.cover p  { font-size: 1rem; color: #666; }

.toc { page-break-after: always; padding-top: 2rem; }
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
.toc td:first-child { width: 2rem; color: #999; }
.toc td:last-child  {
  width: 4rem;
  text-align: right;
  color: var(--accent);
  font-weight: 700;
}

.song-page { page-break-before: always; padding-top: 1rem; }
`

export const PDF_STYLES = SONG_CSS + SONG_STYLES_CSS + PDF_BOOK_CSS
