import { PDF_STYLES } from "./styles"

export interface PdfSong {
  title: string
  artist: string
  displayKey: string
  capo: number | null
  content: string
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Genera l'HTML complet del cançoner per Puppeteer.
 * Estructura: portada → índex → pàgina per cançó.
 *
 * IMPORTANT: el `content` ja conté tags `<ch>` i `<sec>` literals
 * provinents de la BD; **NO** s'han d'escapar. Per a la portada,
 * l'índex i les capçaleres sí s'escapen perquè poden contenir
 * caràcters especials.
 */
export function buildHtml(title: string, songs: PdfSong[]): string {
  const safeTitle = escHtml(title)
  const date = new Date().toLocaleDateString("ca-ES")

  const tocRows = songs
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${escHtml(s.title)}</td><td>${escHtml(s.artist)}</td><td>${escHtml(s.displayKey)}</td></tr>`,
    )
    .join("")

  const pages = songs
    .map(
      (s) => `
    <section class="song-page">
      <h2 class="song-title">${escHtml(s.title)}</h2>
      <p class="song-meta">${escHtml(s.artist)} &nbsp;·&nbsp; To: ${escHtml(s.displayKey)}${s.capo ? ` &nbsp;·&nbsp; Cejilla: ${s.capo}` : ""}</p>
      <div class="song-content">${s.content}</div>
    </section>`,
    )
    .join("")

  return `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="UTF-8">
<style>${PDF_STYLES}</style>
</head>
<body>

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
