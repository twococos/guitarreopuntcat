import { buildQrSvg } from "./qr"
import { renderSongHtml } from "@/components/song/SongView"
import { transposeKey, respellAccidentals, ALL_SHARPS } from "@/lib/transpose"
import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"
import { getT } from "@/lib/i18n"
import type { PdfSong } from "./types"

/**
 * Peces HTML del cançoner, a punt perquè el paginador les col·loqui.
 *
 * Mateixes classes que la vista de la web (perquè song.css i
 * song-styles.css apliquin igual). Retorna les peces per separat i parteix
 * el cos de cada cançó en unitats paginables.
 */
export interface BookParts {
  coverHtml: string | null
  tocHtml: string | null
  songHtmls: string[]
  /** Classes del <body> (with-breaks / no-breaks / book-format). */
  bodyClass: string
  /** Variables CSS inline del <body>. */
  bodyStyle: string
}

export const COVER_IMAGE_URL = "/img/cover-default.jpg"

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Link de capçalera segons la plataforma, amb fallback a l'altra. */
function resolveLinkUrl(
  platform: "none" | "youtube" | "spotify",
  yt: string | null,
  sp: string | null,
): string | null {
  if (platform === "none") return null
  if (platform === "youtube") return yt ?? sp ?? null
  return sp ?? yt ?? null
}

/**
 * Parteix el contingut d'una cançó (un sol bloc `pre-wrap` amb `\n`) en
 * unitats paginables: una `.pdf-line` per línia, i cada títol de secció
 * agrupat amb la línia següent perquè mai quedi orfe a final de pàgina.
 *
 * Els `<sec>` reben el text "— X —" real: al PDF no hi ha pseudo-elements
 * (`::before`/`::after` no són al DOM), així que el CSS del frame els
 * anul·la i aquí posem el mateix text.
 */
export function splitSongBody(content: string): string {
  const lines = content.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n")
  const lineHtml = (l: string): string => {
    const withDashes = l.replace(/<sec>([\s\S]*?)<\/sec>/g, "<sec>— $1 —</sec>")
    const isBlank = l.replace(/<[^>]*>/g, "").trim() === "" && !/<ch>/.test(l)
    return isBlank
      ? `<div class="pdf-line pdf-blank"><br></div>`
      : `<div class="pdf-line">${withDashes}</div>`
  }
  const units: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/<sec>/.test(line) && i + 1 < lines.length) {
      units.push(`<div class="pdf-unit">${lineHtml(line)}${lineHtml(lines[i + 1])}</div>`)
      i++
    } else {
      const blank = lineHtml(line).includes("pdf-blank")
      units.push(`<div class="pdf-unit${blank ? " pdf-unit-blank" : ""}">${lineHtml(line)}</div>`)
    }
  }
  return units.join("")
}

export async function buildBookParts(
  title: string,
  style: CanconerStyle,
  accentColor: string | null,
  songs: PdfSong[],
  options: PdfOptions,
): Promise<BookParts> {
  const t = getT()
  const safeTitle = escHtml(title)
  const date = new Date().toLocaleDateString("ca-ES")
  const notationMap = options.notation ?? ALL_SHARPS

  // ── Link (títol) i QR per cançó, independents ──
  const linkUrls = songs.map((s) => resolveLinkUrl(options.link_platform, s.youtubeUrl, s.spotifyUrl))
  const qrUrls = songs.map((s) => resolveLinkUrl(options.qr_platform, s.youtubeUrl, s.spotifyUrl))
  const qrSvgs: Array<string | null> =
    options.qr_platform !== "none"
      ? await Promise.all(qrUrls.map((u) => (u ? buildQrSvg(u) : Promise.resolve(null))))
      : qrUrls.map(() => null)

  // ── Portada ──
  // Si la imatge no carrega, el frame la treu i hi posa la classe no-img.
  const coverHtml = options.show_cover
    ? `<div class="cover">
    <img class="cover-img" src="${COVER_IMAGE_URL}" alt="">
    <div class="cover-overlay">
      <h1>${safeTitle}</h1>
      ${options.cover_subtitle ? `<p class="cover-subtitle">${escHtml(options.cover_subtitle)}</p>` : ""}
      <p class="cover-date">${escHtml(t.common.pdfDocument.generatEl(date))}</p>
    </div>
  </div>`
    : null

  // ── Índex ──
  // La cel·la .toc-page porta un 0 provisional (perquè la fila ja tingui
  // l'alçada definitiva en paginar l'índex); el paginador hi escriu el
  // número real quan sap a quina pàgina ha caigut cada cançó.
  const tocHtml = options.show_index
    ? `<div class="toc">
    <h2>${escHtml(t.common.pdfDocument.index)}</h2>
    <table><tbody>${songs
      .map((s, i) => {
        const displayKey = respellAccidentals(transposeKey(s.key, s.semitones), notationMap)
        return (
          `<tr data-song-idx="${i + 1}">` +
          `<td class="toc-num">${i + 1}</td>` +
          `<td><a class="toc-link" href="#song-${i + 1}">${escHtml(s.title)}</a></td>` +
          `<td>${escHtml(s.artist)}</td>` +
          `<td>${escHtml(displayKey)}</td>` +
          `<td class="toc-page"><a href="#song-${i + 1}">0</a></td>` +
          `</tr>`
        )
      })
      .join("")}</tbody></table>
  </div>`
    : null

  // ── Cançons ──
  const songHtmls = songs.map((s, i) => {
    const html = renderSongHtml({
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
    })
    // renderSongHtml acaba amb `<div class="song-body">CONTINGUT</div></article>`:
    // substituïm el contingut pel partit en unitats.
    const bodyOpen = '<div class="song-body">'
    const start = html.lastIndexOf(bodyOpen)
    const end = html.lastIndexOf("</div>")
    const body = html.slice(start + bodyOpen.length, end)
    const split = html.slice(0, start + bodyOpen.length) + splitSongBody(body) + html.slice(end)
    return `<section class="song-page" id="song-${i + 1}" data-song-idx="${i + 1}">${split}</section>`
  })

  const bodyStyle = [
    accentColor ? `--accent: ${accentColor}` : "",
    `--pdf-cols: ${options.columns}`,
    `--pdf-font-scale: ${options.font_scale}`,
  ]
    .filter(Boolean)
    .join("; ")

  const bodyClass = [options.page_breaks ? "with-breaks" : "no-breaks", options.book_format ? "book-format" : ""]
    .filter(Boolean)
    .join(" ")

  return { coverHtml, tocHtml, songHtmls, bodyClass, bodyStyle }
}
