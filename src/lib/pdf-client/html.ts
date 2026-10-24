import { buildQrSvg } from "./qr"
import { renderSongHtml } from "@/components/song/SongView"
import {
  transposeKey,
  transposeContent,
  respellAccidentals,
  respellContent,
  toSolfege,
  ALL_SHARPS,
} from "@/lib/transpose"
import { chordDiagramHtml, collectChords, sortChords } from "@/lib/chords/diagram"
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
  /** Glossari d'acords del llibre (va després de l'índex). */
  glossaryHtml: string | null
  songHtmls: string[]
  /** Classes del <body> (with-breaks / no-breaks / book-format / lyrics-only / chords-left). */
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

/** Com es posen els acords al cos: damunt la lletra (el normal), cap, o a l'esquerra del vers. */
export type ChordsMode = "above" | "none" | "left"

const CHORD_RE = /<ch>([^<]*)<\/ch>/g

/** Text d'una línia sense acords; els espais que només separaven acords es col·lapsen. */
function lyricOf(line: string): string {
  return line.replace(CHORD_RE, "").replace(/(\S) {2,}/g, "$1 ").replace(/\s+$/, "")
}

const isSectionLine = (l: string) => /<sec>/.test(l)
/** Seccions que són tornada (no la pre-tornada): es marquen quan s'amaguen els títols. */
const CHORUS_RE = /^\s*(tornada|chorus|estribillo)/i
const isBlankLine = (l: string) => l.replace(/<[^>]*>/g, "").trim() === "" && !/<ch>/.test(l)

/**
 * «Només lletra»: treu els acords, les línies que només en tenien, els títols
 * de secció que es queden sense lletra (Intro, Instrumental…) i les línies en
 * blanc que queden repetides (o a l'inici o al final).
 */
export function stripChords(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const hadChords = /<ch>/.test(l)
    const lyric = lyricOf(l)
    if (hadChords && lyric.replace(/<[^>]*>/g, "").trim() === "") continue
    if (isBlankLine(lyric) && (out.length === 0 || isBlankLine(out[out.length - 1]))) continue
    out.push(lyric)
  }
  // Títols sense lletra fins al títol següent: fora, amb els blancs que els segueixen
  // (el d'abans es queda i separa la secció anterior de la següent).
  const kept: string[] = []
  for (let i = 0; i < out.length; i++) {
    if (isSectionLine(out[i])) {
      let j = i + 1
      while (j < out.length && isBlankLine(out[j])) j++
      if (j >= out.length || isSectionLine(out[j])) {
        i = j - 1
        continue
      }
    }
    kept.push(out[i])
  }
  while (kept.length && isBlankLine(kept[0])) kept.shift()
  while (kept.length && isBlankLine(kept[kept.length - 1])) kept.pop()
  return kept
}

/**
 * Parteix el contingut d'una cançó (un sol bloc `pre-wrap` amb `\n`) en
 * unitats paginables: una `.pdf-line` per línia, i cada títol de secció
 * agrupat amb la línia següent perquè mai quedi orfe a final de pàgina.
 *
 * Els `<sec>` reben el text "— X —" real: al PDF no hi ha pseudo-elements
 * (`::before`/`::after` no són al DOM), així que el CSS del frame els
 * anul·la i aquí posem el mateix text.
 *
 * Amb `mode = "left"`, cada vers és una graella: els acords de la línia en
 * una columna a l'esquerra (de `leftWidthMm`) i la lletra al
 * costat. Els versos sense acords porten la columna buida perquè la lletra
 * quedi alineada, i les línies només d'acords surten seguides a tota
 * l'amplada (no a la columna). Amb `"none"`, vegeu `stripChords`.
 *
 * Amb `hideSections`, els títols de secció no surten (ni els blancs que
 * quedarien repetits) i les línies de les tornades porten `.pdf-chorus`
 * (negreta o cursiva segons la classe del body).
 */
export function splitSongBody(
  content: string,
  mode: ChordsMode = "above",
  hideSections = false,
  leftWidthMm = 16,
): string {
  let lines = content.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n")
  if (mode === "none") lines = stripChords(lines)

  const rows: { l: string; chorus: boolean }[] = []
  let inChorus = false
  for (const l of lines) {
    const sec = /<sec>([\s\S]*?)<\/sec>/.exec(l)
    if (sec) inChorus = CHORUS_RE.test(sec[1])
    if (hideSections) {
      if (sec) continue
      if (isBlankLine(l) && (rows.length === 0 || isBlankLine(rows[rows.length - 1].l))) continue
    }
    rows.push({ l, chorus: hideSections && inChorus && !isBlankLine(l) })
  }
  lines = rows.map((r) => r.l)

  const chordsOf = (l: string) => [...l.matchAll(CHORD_RE)].map((m) => m[1].trim()).filter(Boolean).join(" ")
  // Sense cap acord a la cançó, no cal columna.
  const gutter = mode === "left" && lines.some((l) => chordsOf(l) !== "")

  const lineHtml = (i: number): string => {
    const l = lines[i]
    const withDashes = l.replace(/<sec>([\s\S]*?)<\/sec>/g, "<sec>— $1 —</sec>")
    if (isBlankLine(l)) return `<div class="pdf-line pdf-blank"><br></div>`
    const chorus = rows[i].chorus ? " pdf-chorus" : ""
    if (gutter && !isSectionLine(l)) {
      // Línia només d'acords (intro, instrumental): seguits a tota l'amplada, no a la columna.
      if (lyricOf(l).trim() === "") {
        return `<div class="pdf-line pdf-chords-only${chorus}"><span class="pdf-left-ch">${chordsOf(l).replace(/ /g, "  ")}</span></div>`
      }
      return (
        `<div class="pdf-line has-left${chorus}" style="--left-ch-w: ${leftWidthMm}mm">` +
        `<span class="pdf-left-ch">${chordsOf(l)}</span>` +
        `<span class="pdf-left-ly">${lyricOf(withDashes)}</span></div>`
      )
    }
    return `<div class="pdf-line${chorus}">${withDashes}</div>`
  }
  const units: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isSectionLine(line) && i + 1 < lines.length) {
      units.push(`<div class="pdf-unit">${lineHtml(i)}${lineHtml(i + 1)}</div>`)
      i++
    } else {
      const blank = isBlankLine(line)
      units.push(`<div class="pdf-unit${blank ? " pdf-unit-blank" : ""}">${lineHtml(i)}</div>`)
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
  const spell = (k: string) => (options.solfege ? toSolfege(k) : k)
  const chordsMode: ChordsMode = options.lyrics_only ? "none" : options.chords_left ? "left" : "above"

  // ── Acords de cada cançó (transposats i amb les alteracions triades, en
  // notació anglesa: és el que s'analitza per fer el diagrama) ──
  const withDiagrams = !options.lyrics_only && (options.song_chords || options.chord_glossary)
  const songChords = songs.map((s) =>
    withDiagrams ? collectChords(respellContent(transposeContent(s.content, s.semitones), notationMap)) : [],
  )
  const diagram = (c: string) => chordDiagramHtml(c, spell(c))

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
        const displayKey = spell(respellAccidentals(transposeKey(s.key, s.semitones), notationMap))
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

  // ── Glossari d'acords ──
  // Tots els acords del llibre, ordenats per arrel. Els que no tenen
  // diagrama (N.C., notació estranya) no hi surten.
  const glossaryItems =
    options.chord_glossary && !options.lyrics_only
      ? sortChords([...new Set(songChords.flat())])
          .map(diagram)
          .filter((h): h is string => h !== null)
      : []
  const glossaryHtml = glossaryItems.length
    ? `<div class="chord-glossary">
    <h2>${escHtml(t.common.pdfDocument.glossari)}</h2>
    <div class="glossary-grid">${glossaryItems.join("")}</div>
  </div>`
    : null

  // ── Cançons ──
  const songHtmls = songs.map((s, i) => {
    const chordDiagramsHtml = options.song_chords
      ? songChords[i]
          .map(diagram)
          .filter((h): h is string => h !== null)
          .join("")
      : ""
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
      solfege: options.solfege,
      chordDiagramsHtml,
    })
    // renderSongHtml acaba amb `<div class="song-body">CONTINGUT</div></article>`:
    // substituïm el contingut pel partit en unitats.
    const bodyOpen = '<div class="song-body">'
    const start = html.lastIndexOf(bodyOpen)
    const end = html.lastIndexOf("</div>")
    const body = html.slice(start + bodyOpen.length, end)
    const split = html.slice(0, start + bodyOpen.length) + splitSongBody(body, chordsMode, options.hide_sections, options.chords_left_width) + html.slice(end)
    return `<section class="song-page" id="song-${i + 1}" data-song-idx="${i + 1}">${split}</section>`
  })

  const bodyStyle = [
    accentColor ? `--accent: ${accentColor}` : "",
    `--pdf-cols: ${options.columns}`,
    `--pdf-font-scale: ${options.font_scale}`,
  ]
    .filter(Boolean)
    .join("; ")

  const bodyClass = [
    options.page_breaks ? "with-breaks" : "no-breaks",
    options.book_format ? "book-format" : "",
    chordsMode === "none" ? "lyrics-only" : chordsMode === "left" ? "chords-left" : "",
    chordsMode === "left" && options.chords_left_align === "right" ? "chords-left-right" : "",
    options.hide_sections ? `chorus-${options.chorus_style}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  return { coverHtml, tocHtml, glossaryHtml, songHtmls, bodyClass, bodyStyle }
}
