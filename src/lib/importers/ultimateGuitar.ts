/**
 * Importador per a www.ultimate-guitar.com / tabs.ultimate-guitar.com
 *
 * UG protegeix les pàgines amb Cloudflare Turnstile: una petició HTTP simple
 * retorna sempre el challenge i mai el contingut. Per això usem
 * `puppeteerFetch`, que llança Chromium headless (la mateixa dependència que
 * el generador de PDFs).
 *
 * L'HTML un cop carregat té aquesta estructura:
 *   <h1>Titol Acordes </h1>      (acaba amb " Acordes"/" Chords"/" Cifra")
 *   <a href="/artist/...">Artista</a>
 *   ...
 *   Tonalidad: <span>E</span>
 *   Cejilla: <span>Sin cejilla</span>  (o "1ª fret", "2º traste", etc.)
 *   <pre class="k_vI3 ...">
 *     [Intro]
 *     <span data-name="E">E</span>   <span data-name="Asus2">Asus2</span>
 *     Lletra de la cançó amb els acords posicionats per damunt
 *     ...
 *   </pre>
 *
 * Convenis:
 * - Cada acord és un <span data-name="X"> on `X` és l'acord ja en notació
 *   anglesa. Ocasionalment apareixen com a text pla (cançons antigues sense
 *   markup); el parser les detecta igualment per regex.
 * - Les seccions s'identifiquen amb `[Nom]` al començament de línia.
 * - Pot haver-hi text descriptiu sobre el cos (links de YouTube, comentaris)
 *   abans del primer `[Secció]` o primera línia d'acords — el descartem.
 */

import { parse, type HTMLElement } from "node-html-parser"
import type { Importer, ImportResult } from "./types"

export const ultimateGuitar: Importer = {
  host: "tabs.ultimate-guitar.com",

  match(url) {
    const h = url.hostname.toLowerCase()
    return (
      h === "tabs.ultimate-guitar.com" ||
      h === "www.ultimate-guitar.com" ||
      h === "ultimate-guitar.com"
    )
  },

  async fetch(url) {
    // Import dinàmic per evitar que puppeteer es carregui en contexts
    // que només volen el `parse` (p.ex. tests aïllats sense Node Puppeteer).
    const { puppeteerFetch } = await import("./puppeteerFetch")
    return puppeteerFetch(url, {
      waitForSelector: "pre.k_vI3, code.QsmqP pre, section.s-juq pre",
      settleMs: 1500,
      timeoutMs: 60_000,
    })
  },

  parse(html, _url): ImportResult {
    const root = parse(html)

    // ── Metadades ──
    const rawTitle = textOf(root.querySelector("h1.glHTJ")) || textOf(root.querySelector("h1"))
    const title = cleanTitle(rawTitle)
    const artist = findArtist(root)
    const { key, capo } = findKeyAndCapo(root)
    const language = languageFromHtml(root)

    // ── Metadades opcionals des del JSON de UG (best-effort) ──
    const ugMeta = extractUgMeta(html)

    // ── Cos (pre) ──
    const pre =
      root.querySelector("section.s-juq pre") ??
      root.querySelector("code.QsmqP pre") ??
      root.querySelector("pre.k_vI3") ??
      root.querySelector("pre")
    if (!pre) throw new Error("No s'ha trobat el <pre> amb la cançó")

    const lines = extractLines(pre)
    const { content, detectedKey } = buildContent(lines)

    return {
      title: title || "Sense títol",
      artist: artist || "Desconegut",
      key: key || detectedKey || "Am",
      capo,
      language,
      tags: "",
      content,
      ...(ugMeta.album !== undefined && { album: ugMeta.album }),
      ...(ugMeta.year !== undefined && { year: ugMeta.year }),
      ...(ugMeta.youtubeUrl !== undefined && { youtubeUrl: ugMeta.youtubeUrl }),
      ...(ugMeta.spotifyUrl !== undefined && { spotifyUrl: ugMeta.spotifyUrl }),
    }
  },
}

/* ──────────────────────────── Extracció estructurada ──────────────────────────── */

type LineBody =
  | { type: "section"; name: string }
  | { type: "section+chords"; name: string; tokens: ChordToken[] }
  | { type: "chords"; tokens: ChordToken[] }
  | { type: "lyric"; text: string }
  | { type: "blank" }

interface ChordToken {
  chord: string
  col: number
}

/**
 * El <pre> té el contingut barrejat amb <span data-name="X">X</span>. Treballem
 * sobre l'HTML cru del pre (innerHTML) per preservar les posicions visuals:
 *
 *   \x01 = obre acord     \x02 = tanca acord
 *
 * Cada span de tipus `data-name` es substitueix per "\x01ACORD\x02" preservant
 * la longitud visual exacta (el text dins del span és el mateix que l'atribut
 * data-name a UG, així que la geometria es manté).
 *
 * També convertim les línies que tinguin acords només en TEXT pla (línies tipus
 * "E      Asus2") perquè el mateix algoritme les processi.
 */
function extractLines(pre: HTMLElement): LineBody[] {
  let raw = pre.innerHTML ?? ""

  // UG afegeix al final del <pre> un marcador antipirateria ("X" o similar)
  // amb classe `d8c-l`. L'eliminem juntament amb el seu contingut.
  raw = raw.replace(/<div\b[^>]*class=["'][^"']*d8c-l[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")

  // Substituim els spans d'acord per marcadors. El text dins (innerText)
  // coincideix amb data-name a UG, però utilitzem el contingut intern per
  // preservar exactament el que es veu.
  raw = raw.replace(
    /<span\b[^>]*\bdata-name=["']([^"']+)["'][^>]*>([^<]*)<\/span>/gi,
    (_m, _name: string, inner: string) => `\x01${inner}\x02`,
  )
  // Hi pot haver altres spans (color, etc.) sense data-name: els eliminem
  // mantenint el seu contingut textual.
  raw = raw.replace(/<\/?(span|i|u|em|strong|b|code|section|div)\b[^>]*>/gi, "")
  raw = decode(raw)
  raw = raw.replace(/\r\n?/g, "\n")

  return raw.split("\n").map(parseLine)
}

function parseLine(raw: string): LineBody {
  // Versió "visual" sense els marcadors (per calcular columnes)
  let visual = ""
  const segs: { kind: "plain" | "chord"; text: string; col: number }[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === "\x01") {
      const end = raw.indexOf("\x02", i + 1)
      const text = end === -1 ? raw.slice(i + 1) : raw.slice(i + 1, end)
      segs.push({ kind: "chord", text, col: visual.length })
      visual += text
      i = end === -1 ? raw.length : end + 1
    } else {
      const next1 = raw.indexOf("\x01", i)
      const slice = next1 === -1 ? raw.slice(i) : raw.slice(i, next1)
      segs.push({ kind: "plain", text: slice, col: visual.length })
      visual += slice
      i = next1 === -1 ? raw.length : next1
    }
  }

  if (visual.trim() === "") return { type: "blank" }

  const hasChordSpan = segs.some((s) => s.kind === "chord")
  const plainConcat = segs
    .filter((s) => s.kind === "plain")
    .map((s) => s.text)
    .join("")

  // Secció: [Nom] al començament (amb possible indentació davant).
  const visualTrim = visual.trimStart()
  const secMatch = /^\[([^\]\n]+)\](.*)$/.exec(visualTrim)
  if (secMatch) {
    const name = secMatch[1].trim()
    const rest = secMatch[2]
    if (rest.trim() === "") return { type: "section", name }
    // [Intro] B A E B x2  → emetem secció + línia d'acords/text.
    // Tractem `rest` com una pseudo-línia separada perquè a vegades pot tenir
    // tant acords amb span com text. Reaprofitem el segs offset.
    const offsetInVisual = visual.indexOf(secMatch[0]) + (secMatch[0].length - rest.length)
    const tokens = extractChordTokens(segs, offsetInVisual, rest)
    if (tokens.length > 0) return { type: "section+chords", name, tokens }
    return { type: "section", name }
  }

  // Línia d'acords (markup explícit amb spans) OR línia d'acords text-pla.
  if (hasChordSpan) {
    const allPlainBlank = segs
      .filter((s) => s.kind === "plain")
      .every((s) => s.text.trim() === "" || /^[\s|x\d]*$/i.test(s.text))
    const tokens = extractChordTokens(segs, 0, visual)
    if (allPlainBlank && tokens.length > 0) {
      return { type: "chords", tokens }
    }
    if (tokens.length > 0) {
      // Línia mixta (rara): emetem només els acords descartant el text pla.
      return { type: "chords", tokens }
    }
  }

  // Línia de text que sembla només d'acords (sense markup): B  A  E  B
  // L'heurística: la línia conté tot tokens vàlids d'acord (i opcionalment | i x\d).
  if (isPlainChordLine(visual)) {
    const tokens = extractPlainChordTokens(visual)
    if (tokens.length > 0) return { type: "chords", tokens }
  }

  return { type: "lyric", text: plainConcat || visual }
}

function extractChordTokens(
  segs: { kind: "plain" | "chord"; text: string; col: number }[],
  colOffset: number,
  fallbackText: string,
): ChordToken[] {
  const tokens: ChordToken[] = []
  for (const seg of segs) {
    if (seg.kind !== "chord") continue
    const col = seg.col - colOffset
    if (col < 0) continue
    // El text dins el span pot contenir més d'un token (rar). El partim
    // per espais i descartem tokens no vàlids.
    let j = 0
    while (j < seg.text.length) {
      while (j < seg.text.length && /\s/.test(seg.text[j])) j++
      if (j >= seg.text.length) break
      const start = j
      while (j < seg.text.length && !/\s/.test(seg.text[j])) j++
      const word = seg.text.slice(start, j)
      const normalized = normalizeChord(word)
      if (normalized) tokens.push({ chord: normalized, col: col + start })
    }
  }
  // Si no s'ha aconseguit cap token via spans, intenta-ho amb text pla.
  if (tokens.length === 0 && isPlainChordLine(fallbackText)) {
    return extractPlainChordTokens(fallbackText)
  }
  return tokens
}

/**
 * Una línia és "només acords en text pla" si tots els seus tokens visibles
 * són acords vàlids (amb tolerància per a barres de compàs `|` i marques `x2`).
 */
function isPlainChordLine(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) return false
  const tokens = t.split(/\s+/)
  if (tokens.length === 0) return false
  let chordCount = 0
  for (const tok of tokens) {
    if (tok === "|" || /^x\d+$/i.test(tok)) continue
    if (normalizeChord(tok) !== null) {
      chordCount++
    } else {
      return false
    }
  }
  return chordCount > 0
}

function extractPlainChordTokens(text: string): ChordToken[] {
  const tokens: ChordToken[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tok = m[0]
    if (tok === "|" || /^x\d+$/i.test(tok)) continue
    const normalized = normalizeChord(tok)
    if (normalized) tokens.push({ chord: normalized, col: m.index })
  }
  return tokens
}

/* ──────────────────────────── Construcció del contingut ──────────────────────────── */

function buildContent(lines: LineBody[]): {
  content: string
  detectedKey: string | null
} {
  const out: string[] = []
  let detectedKey: string | null = null
  let firstStructuralSeen = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Saltem línies de capçalera descriptives (links, comentaris) fins a
    // trobar la primera secció o línia d'acords.
    if (!firstStructuralSeen) {
      if (
        line.type === "section" ||
        line.type === "section+chords" ||
        line.type === "chords"
      ) {
        firstStructuralSeen = true
      } else {
        continue
      }
    }

    if (line.type === "blank") {
      out.push("")
      continue
    }

    if (line.type === "section") {
      out.push(`<sec>${line.name}</sec>`)
      continue
    }

    if (line.type === "section+chords") {
      out.push(`<sec>${line.name}</sec>`)
      if (detectedKey === null && line.tokens.length > 0) {
        detectedKey = keyFromFirstChord(line.tokens[0].chord)
      }
      const next = lines[i + 1]
      if (next && next.type === "lyric") {
        out.push(mergeChordsIntoLyric(line.tokens, next.text))
        i++
      } else {
        out.push(chordLine(line.tokens))
      }
      continue
    }

    if (line.type === "chords") {
      if (detectedKey === null && line.tokens.length > 0) {
        detectedKey = keyFromFirstChord(line.tokens[0].chord)
      }
      const next = lines[i + 1]
      if (next && next.type === "lyric") {
        out.push(mergeChordsIntoLyric(line.tokens, next.text))
        i++
      } else {
        out.push(chordLine(line.tokens))
      }
      continue
    }

    // line.type === "lyric"
    out.push(line.text)
  }

  while (out.length > 0 && out[0] === "") out.shift()
  while (out.length > 0 && out[out.length - 1] === "") out.pop()

  return { content: out.join("\n"), detectedKey }
}

function mergeChordsIntoLyric(tokens: ChordToken[], lyric: string): string {
  const sorted = [...tokens].sort((a, b) => b.col - a.col)
  const maxCol = sorted.length > 0 ? sorted[0].col : 0
  let line = lyric
  if (line.length < maxCol) line = line.padEnd(maxCol, " ")
  for (const t of sorted) {
    const before = line.slice(0, t.col)
    const after = line.slice(t.col)
    line = `${before}<ch>${t.chord}</ch>${after}`
  }
  return line
}

function chordLine(tokens: ChordToken[]): string {
  return tokens.map((t) => `<ch>${t.chord}</ch>`).join(" ")
}

/* ──────────────────────────── Normalització d'acords ──────────────────────────── */

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Fb: "E",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
}

function normalizeChord(rawToken: string): string | null {
  const token = rawToken.replace(/[,;.]+$/, "").trim()
  if (token.length === 0) return null

  if (token.includes("/")) {
    const [main, bass] = token.split("/", 2)
    const m = normalizeSingleChord(main)
    const b = normalizeSingleChord(bass)
    if (!m || !b) return null
    return `${m}/${b}`
  }

  return normalizeSingleChord(token)
}

function normalizeSingleChord(raw: string): string | null {
  const token = raw.trim()
  if (token.length === 0) return null
  const m = /^([A-G])(.*)$/.exec(token)
  if (!m) return null
  return finalize(m[1], m[2])
}

function finalize(rootLetter: string, rest: string): string | null {
  let root = rootLetter
  let suffix = rest
  if (suffix.startsWith("#")) {
    root += "#"
    suffix = suffix.slice(1)
  } else if (suffix.startsWith("b")) {
    const flat = `${rootLetter}b`
    if (FLAT_TO_SHARP[flat]) {
      root = FLAT_TO_SHARP[flat]
      suffix = suffix.slice(1)
    }
  }
  if (!/^[a-zA-Z0-9+°ºø/()#+\-]*$/.test(suffix)) return null
  return root + suffix
}

function keyFromFirstChord(chord: string): string {
  const m = /^([A-G]#?)(m)?/.exec(chord)
  if (!m) return "Am"
  return m[2] === "m" ? `${m[1]}m` : m[1]
}

/* ──────────────────────────── Metadades opcionals UG ──────────────────────────── */

interface UgOptionalMeta {
  album?: string
  year?: number
  youtubeUrl?: string
  spotifyUrl?: string
}

/**
 * Intenta extreure metadades del JSON embegut a la pàgina de UG.
 * UG sol tenir un element <div class="js-store" data-content="..."> amb un
 * JSON gran que conté UGAPP.store.page.data.tab (o estructura similar).
 * També busca dins scripts inline i al text de la pàgina com a fallback.
 */
function extractUgMeta(html: string): UgOptionalMeta {
  const result: UgOptionalMeta = {}

  try {
    // Cerca el JSON al data-content del js-store
    const storeM = /data-content="([^"]+)"/.exec(html)
    if (storeM) {
      const jsonStr = storeM[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      const data: unknown = JSON.parse(jsonStr)
      extractFromUgJson(data, result)
    }
  } catch { /* best-effort */ }

  // Fallback: cerca dins scripts inline el JSON de la pàgina
  if (!result.album && !result.year && !result.youtubeUrl) {
    try {
      const scriptM = /window\.UGAPP\s*=\s*(\{[\s\S]*?\});\s*(?:\/\/|<\/script>)/.exec(html)
      if (scriptM) {
        const data: unknown = JSON.parse(scriptM[1])
        extractFromUgJson(data, result)
      }
    } catch { /* best-effort */ }
  }

  // Fallback: cerca Spotify a tot el HTML
  if (!result.spotifyUrl) {
    try {
      const spotM = /(https?:\/\/open\.spotify\.com\/[^\s"'<>]+)/.exec(html)
      if (spotM) result.spotifyUrl = spotM[1]
    } catch { /* best-effort */ }
  }

  return result
}

function extractFromUgJson(data: unknown, result: UgOptionalMeta): void {
  if (!data || typeof data !== "object") return
  const obj = data as Record<string, unknown>

  // Navegar per l'estructura profunda: store.page.data.tab
  const store = obj.store as Record<string, unknown> | undefined
  const page = store?.page as Record<string, unknown> | undefined
  const pageData = page?.data as Record<string, unknown> | undefined
  const tab = pageData?.tab as Record<string, unknown> | undefined

  // Si no hi ha el camí típic, potser `data` ja és tab directament
  const tabObj: Record<string, unknown> = tab ?? obj

  try {
    if (!result.album) {
      const albumName = tabObj.album_name
      if (typeof albumName === "string" && albumName.trim()) {
        result.album = albumName.trim()
      }
    }
  } catch { /* best-effort */ }

  try {
    if (!result.year) {
      const albumYear = tabObj.album_year
      if (typeof albumYear === "number" && albumYear >= 1000 && albumYear <= 2100) {
        result.year = albumYear
      } else if (typeof albumYear === "string") {
        const y = parseInt(albumYear, 10)
        if (y >= 1000 && y <= 2100) result.year = y
      }
    }
  } catch { /* best-effort */ }

  try {
    if (!result.youtubeUrl) {
      // Prova video_url i recommended_youtube_id
      const videoUrl = tabObj.video_url
      if (typeof videoUrl === "string" && videoUrl.trim()) {
        const yt = extractYoutubeUrl(videoUrl.trim())
        if (yt) result.youtubeUrl = yt
      }
      if (!result.youtubeUrl) {
        const ytId = tabObj.recommended_youtube_id
        if (typeof ytId === "string" && ytId.trim()) {
          result.youtubeUrl = `https://www.youtube.com/watch?v=${ytId.trim()}`
        }
      }
    }
  } catch { /* best-effort */ }

  try {
    if (!result.spotifyUrl) {
      // Cerca recursivament "open.spotify.com" al JSON serialitzat
      const jsonStr = JSON.stringify(data)
      const spotM = /(https?:\/\/open\.spotify\.com\/[^\s"'\\<>]+)/.exec(jsonStr)
      if (spotM) result.spotifyUrl = spotM[1]
    }
  } catch { /* best-effort */ }
}

function extractYoutubeUrl(raw: string): string | undefined {
  if (!raw) return undefined
  const embedM = /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/.exec(raw)
  if (embedM) return `https://www.youtube.com/watch?v=${embedM[1]}`
  const watchM = /youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})/.exec(raw)
  if (watchM) return `https://www.youtube.com/watch?v=${watchM[1]}`
  const shortM = /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(raw)
  if (shortM) return `https://www.youtube.com/watch?v=${shortM[1]}`
  return undefined
}

/* ──────────────────────────── Metadades ──────────────────────────── */

/**
 * El <h1> ve com "Els Ocells Acordes ", "Flor De Primavera Acordes ",
 * "Song Title Chords", "Song Title Cifra" segons l'idioma del UA. Treiem
 * el sufix si és present.
 */
function cleanTitle(raw: string): string {
  let t = raw.trim()
  // Sufixos coneguts en diverses llengües
  const suffixes = [
    /\bacordes\s*$/i,
    /\bchords\s*$/i,
    /\bcifra\s*$/i,
    /\backorde\s*$/i,
    /\btab\s*$/i,
  ]
  for (const re of suffixes) {
    if (re.test(t)) {
      t = t.replace(re, "").trim()
      break
    }
  }
  return t
}

/** Cerca l'artista a partir d'un enllaç `/artist/...` proper al h1. */
function findArtist(root: HTMLElement): string {
  const link = root.querySelector('a[href*="/artist/"]')
  if (link) return textOf(link)
  return ""
}

/**
 * Cerca "Tonalidad: X" (o variant en altres idiomes) i "Cejilla: X".
 * UG els renderitza com <span>Tonalidad:</span><span>X</span>; per simplicitat
 * cerquem dins el text complet de la pàgina principal.
 */
function findKeyAndCapo(root: HTMLElement): { key: string; capo: number } {
  // L'àrea de metadades sol estar dins .HSoLS / .CCUPL prop del títol.
  // Per ser robusts contra canvis de classes, cerquem dins tot el body el
  // patró "Etiqueta: valor" amb un text d'etiqueta conegut.
  const text = root.text

  let key = ""
  const keyMatch = /(?:Tonalidad|Key|Tonalitat|Tom)\s*:\s*([A-G][#b]?m?)\b/i.exec(text)
  if (keyMatch) key = normalizeKey(keyMatch[1])

  let capo = 0
  const capoMatch = /(?:Cejilla|Capo|Capotraste|Capodastre)\s*:\s*([^\n]{0,40})/i.exec(text)
  if (capoMatch) capo = parseCapo(capoMatch[1])

  return { key, capo }
}

function normalizeKey(raw: string): string {
  const token = raw.trim()
  if (!token) return ""
  const m = /^([A-G])(#|b)?(m)?$/.exec(token)
  if (!m) return ""
  let root = m[1]
  if (m[2] === "#") root += "#"
  else if (m[2] === "b") {
    const flat = `${m[1]}b`
    root = FLAT_TO_SHARP[flat] ?? root
  }
  return m[3] === "m" ? `${root}m` : root
}

/**
 * El text del capo a UG pot ser:
 *   "Sin cejilla" / "No capo" / "Sense cejilla" → 0
 *   "1ª fret" / "2º traste" / "3rd fret" → 1/2/3
 */
function parseCapo(raw: string): number {
  if (!raw) return 0
  if (/sin|sense|no\s*(capo|cejilla|capotraste|capodastre)/i.test(raw)) return 0
  const m = /(\d+)/.exec(raw)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 0
}

function languageFromHtml(root: HTMLElement): string {
  const htmlEl = root.querySelector("html") ?? root
  const lang = (htmlEl.getAttribute("lang") ?? "").toLowerCase()
  if (lang.startsWith("ca")) return "ca"
  if (lang.startsWith("es")) return "es"
  if (lang.startsWith("en")) return "en"
  return "other"
}

/* ──────────────────────────── Helpers ──────────────────────────── */

function textOf(el: HTMLElement | null): string {
  if (!el) return ""
  return decode(el.text).trim().replace(/\s+/g, " ")
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => HTML_ENTITIES[name] ?? m)
}

const HTML_ENTITIES: Record<string, string> = {
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Agrave: "À", Egrave: "È", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
  ouml: "ö", uuml: "ü", euml: "ë", iuml: "ï",
  Auml: "Ä", Ouml: "Ö", Uuml: "Ü", auml: "ä",
  middot: "·", rarr: "→",
}
