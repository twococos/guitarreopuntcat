import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildPdfStyles } from "./styles"
import { buildQrSvg } from "./qr"
import { renderSongHtml } from "@/components/song/SongView"
import { transposeKey, respellAccidentals, ALL_SHARPS } from "@/lib/transpose"
import { type CanconerStyle, type PdfOptions } from "@/lib/schemas/canconer"

export interface PdfSong {
  title: string
  artist: string
  key: string
  capo: number | null
  content: string
  semitones: number
  album?: string | null
  year?: number | null
  youtubeUrl?: string | null
  spotifyUrl?: string | null
}

/**
 * Resol el link de capçalera segons la plataforma triada, amb fallback
 * automàtic a l'altra plataforma si la triada no té link a la cançó.
 */
function resolveLinkUrl(
  platform: "none" | "youtube" | "spotify",
  yt: string | null | undefined,
  sp: string | null | undefined,
): string | null {
  if (platform === "none") return null
  if (platform === "youtube") return yt ?? sp ?? null
  return sp ?? yt ?? null
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
export async function buildHtml(
  title: string,
  style: CanconerStyle,
  accentColor: string | null,
  songs: PdfSong[],
  options: PdfOptions,
): Promise<string> {
  const safeTitle = escHtml(title)
  const date = new Date().toLocaleDateString("ca-ES")
  // Notació enharmònica del render (default sostinguts si el cançoner és antic).
  const notationMap = options.notation ?? ALL_SHARPS

  // ── Resolem link (títol) i QR per cada cançó, independents ──
  const linkUrls = songs.map((s) =>
    resolveLinkUrl(options.link_platform, s.youtubeUrl, s.spotifyUrl),
  )
  // El QR pot apuntar a una plataforma diferent de l'enllaç del títol.
  const qrUrls = songs.map((s) =>
    resolveLinkUrl(options.qr_platform, s.youtubeUrl, s.spotifyUrl),
  )
  const qrSvgs: Array<string | null> =
    options.qr_platform !== "none"
      ? await Promise.all(
          qrUrls.map((u) => (u ? buildQrSvg(u) : Promise.resolve(null))),
        )
      : qrUrls.map(() => null)

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
            const displayKey = respellAccidentals(transposeKey(s.key, s.semitones), notationMap)
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
          album: s.album,
          year: s.year,
          semitones: s.semitones,
          number: i + 1,
          styleVariant: style,
          accentColor,
          titleLinkUrl: linkUrls[i],
          qrSvg: qrSvgs[i],
          qrUrl: qrSvgs[i] ? qrUrls[i] : null,
          notation: notationMap,
        }) +
        `</section>`,
    )
    .join("")

  // ── Variables CSS i classes globals ─────────────────
  const fontScale = options.font_scale
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
