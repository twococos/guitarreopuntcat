/**
 * Importador per a www.cifraclub.com
 *
 * L'HTML d'una cançó té aquesta estructura:
 *   <h1 class="t1">Títol</h1>
 *   <h2 class="cifra_acordes--artista">...</h2>
 *   <span id="cifra_tom">tonalidad: <a>Am</a></span>
 *   <span id="cifra_capo">capotraste: <a>1ª fret</a></span>  (opcional)
 *   <pre>
 *     [Hook]
 *
 *     <b>F</b>            <b>G</b>
 *     Na-na-na-na, na-na-na-na
 *     ...
 *   </pre>
 *
 * Els acords arriben en notació anglesa, embolcallats en <b>...</b>. La
 * posició dels acords sobre la lletra ve donada pel nombre d'espais entre
 * els acords dins la línia d'acords.
 *
 * Seccions: cifraclub marca les seccions amb `[Nom]` al començament de línia
 * (en l'idioma de la pàgina — castellà, anglès, etc.). Per l'acord amb el
 * format intern d'El Cançoner, mantenim el text del claudàtor tal qual.
 */

import { parse, type HTMLElement } from "node-html-parser"
import type { Importer, ImportResult } from "./types"
import { defaultFetch } from "./fetch"

export const cifraClub: Importer = {
  host: "www.cifraclub.com",

  match(url) {
    const h = url.hostname.toLowerCase()
    return h === "www.cifraclub.com" || h === "cifraclub.com" || h === "m.cifraclub.com"
  },

  fetch: defaultFetch,

  parse(html, url): ImportResult {
    const root = parse(html)

    const title = textOf(root.querySelector("h1.t1"))
    const artist = artistFromTitle(textOf(root.querySelector("title"))) || guessArtistFromUrl(url)
    const key = normalizeKey(textOf(root.querySelector("#cifra_tom a")))
    const capo = parseCapo(textOf(root.querySelector("#cifra_capo")))
    const language = languageFromHtml(root)

    const pre = root.querySelector(".cifra_cnt pre") ?? root.querySelector("pre")
    if (!pre) throw new Error("No s'ha trobat el <pre> amb la cançó")

    const lines = extractLines(pre)
    const content = buildContent(lines)

    return {
      title: title || "Sense títol",
      artist: artist || "Desconegut",
      key: key || "Am",
      capo,
      language,
      tags: "",
      content,
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
  /** Acord ja normalitzat (notació anglesa, amb sostinguts). */
  chord: string
  /** Columna (0-based) dins la línia d'acords on apareix. */
  col: number
}

/**
 * node-html-parser tracta tot el contingut de <pre> com a un únic TEXT_NODE
 * sense descendir a les etiquetes <b> que hi ha a dins. Substituïm els tags
 * per marcadors de control que conserven la geometria visual.
 *
 *   \x01 = obre <b>      \x02 = tanca </b>
 */
function extractLines(pre: HTMLElement): LineBody[] {
  let raw = pre.rawText ?? pre.textContent ?? ""
  // Hi pot haver <b class="..."> a part del simple <b>. Acceptem ambdós.
  raw = raw.replace(/<b(\s[^>]*)?>/gi, "\x01").replace(/<\/b>/gi, "\x02")
  // Cifraclub a vegades també usa <i>/<u> per a anotacions; els descartem.
  raw = raw.replace(/<\/?(i|u|em|strong|span)(\s[^>]*)?>/gi, "")
  raw = decode(raw)
  raw = raw.replace(/\r\n?/g, "\n")

  return raw.split("\n").map(parseLine)
}

function parseLine(raw: string): LineBody {
  // Versió "visual" sense els marcadors (per calcular columnes)
  let visual = ""
  // Trossos amb posició i marca
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

  const hasChord = segs.some((s) => s.kind === "chord")
  const plainConcat = segs
    .filter((s) => s.kind === "plain")
    .map((s) => s.text)
    .join("")

  // Detecta secció: [Nom] al començament. El text dins de <b> dins el
  // claudàtor no és habitual; treballem amb el visual ja resolt.
  // visual.trimStart() perquè a vegades hi ha indentació davant.
  const visualTrim = visual.trimStart()
  const secMatch = /^\[([^\]\n]+)\](.*)$/.exec(visualTrim)
  if (secMatch) {
    const name = secMatch[1].trim()
    const rest = secMatch[2]
    if (rest.trim() === "") return { type: "section", name }
    // Línia "[Intro] <b>A7M</b>  <b>D7M</b>" — separem secció + acords.
    // Calculem el desplaçament del primer caràcter "real" de rest dins visual
    // per restar-lo a les columnes dels tokens.
    const offsetInVisual = visual.indexOf(secMatch[0]) + (secMatch[0].length - rest.length)
    const tokens = extractChordTokens(segs, offsetInVisual)
    if (tokens.length > 0) return { type: "section+chords", name, tokens }
    return { type: "section", name }
  }

  // Línia d'acords pura: hi ha almenys un <b> i la resta és només espais.
  // Acceptem també línies "mixtes" com "Intro: <b>A</b>  <b>D</b>" → es
  // tractaran com a línia d'acords descartant el text pla (consistent amb
  // acordscatala). El cas habitual a cifraclub és <b> + espais.
  if (hasChord) {
    const allPlainBlank = segs.filter((s) => s.kind === "plain").every((s) => s.text.trim() === "")
    const tokens = extractChordTokens(segs, 0)
    if (allPlainBlank && tokens.length > 0) {
      return { type: "chords", tokens }
    }
    // Línia mixta (rara a cifraclub fora del [Intro]): si hi ha acords vàlids
    // l'emetem com a chords descartant el text pla.
    if (tokens.length > 0) {
      // Si el plain concat és informatiu (no buit) ho podem afegir abans,
      // però per simplicitat l'amaguem (l'usuari ja ho retocarà).
      return { type: "chords", tokens }
    }
  }

  // Pot ser una línia de notes informatives en text pla que no és lletra
  // (p.ex. "1ª-2ª guitarra: ...") — la tractem com a lletra.
  return { type: "lyric", text: plainConcat }
}

/**
 * Extreu tokens d'acord dels segments "chord". Cada segment de tipus chord
 * pot contenir un únic acord o diversos separats per espais (rar però possible).
 * `colOffset` es resta a la columna final (útil quan una línia conté
 * "[Secció] " davant els acords).
 */
function extractChordTokens(
  segs: { kind: "plain" | "chord"; text: string; col: number }[],
  colOffset: number,
): ChordToken[] {
  const tokens: ChordToken[] = []
  for (const seg of segs) {
    if (seg.kind !== "chord") continue
    let j = 0
    while (j < seg.text.length) {
      while (j < seg.text.length && /\s/.test(seg.text[j])) j++
      if (j >= seg.text.length) break
      const start = j
      while (j < seg.text.length && !/\s/.test(seg.text[j])) j++
      const word = seg.text.slice(start, j)
      const normalized = normalizeChord(word)
      if (normalized) {
        const col = seg.col + start - colOffset
        tokens.push({ chord: normalized, col: col < 0 ? 0 : col })
      }
    }
  }
  return tokens
}

/* ──────────────────────────── Construcció del contingut ──────────────────────────── */

function buildContent(lines: LineBody[]): string {
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

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
      // Tractem els acords com una línia d'acords normal; busquem si la línia
      // següent és lletra per fusionar-hi.
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

  // Treu línies en blanc al principi i al final, però conserva les internes
  while (out.length > 0 && out[0] === "") out.shift()
  while (out.length > 0 && out[out.length - 1] === "") out.pop()

  return out.join("\n")
}

function mergeChordsIntoLyric(tokens: ChordToken[], lyric: string): string {
  // Inserim els acords en ordre invers per no desplaçar els índexs anteriors.
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

/**
 * Cifraclub envia acords en notació anglesa amb sufixos com m, 7, M, sus, 7M,
 * 7(4), /baix, etc. Normalitzem bemolls a sostinguts i validem el format.
 */
function normalizeChord(rawToken: string): string | null {
  const token = rawToken.replace(/[,;.]+$/, "").trim()
  if (token.length === 0) return null

  // Slash chord: normalitzem cada banda per separat
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
  // Sufix vàlid: lletres, números, parèntesis i símbols comuns d'acord.
  // Cifraclub usa coses com 7M, 7(4), m7(b5), sus4, °, º, ø.
  if (!/^[a-zA-Z0-9+°ºø/()#+\-]*$/.test(suffix)) return null
  return root + suffix
}

/* ──────────────────────────── Metadades ──────────────────────────── */

/**
 * Extreu l'artista del títol de la pàgina. Patró:
 *   "Cançó (acordes) - Artista - Cifra Club"  (es)
 *   "Song (chords) - Artist - Cifra Club"    (en)
 *   "Cançó (cifra) - Artista - Cifra Club"    (pt)
 * Estratègia: agafa el penúltim camp separat per " - " si l'últim és
 * "Cifra Club"; altrament retorna string buit i deixem que el caller
 * intenti l'URL.
 */
function artistFromTitle(title: string): string {
  if (!title) return ""
  const parts = title.split(" - ").map((s) => s.trim())
  if (parts.length >= 3 && /cifra ?club/i.test(parts[parts.length - 1])) {
    return parts[parts.length - 2]
  }
  return ""
}

/**
 * Plan B: derivar l'artista del segon segment de l'URL.
 * "https://www.cifraclub.com/lady-gaga/die-with-a-smile/" → "Lady Gaga"
 */
function guessArtistFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const seg = u.pathname.split("/").filter(Boolean)[0]
    if (!seg) return ""
    return seg
      .split("-")
      .map((w) => (w.length === 0 ? "" : w[0].toUpperCase() + w.slice(1)))
      .join(" ")
  } catch {
    return ""
  }
}

/**
 * Tonalitat: ve com "Am", "C#", "Bb", etc. Normalitzem bemolls i validem.
 * Si no és vàlid, retornem string buit (el caller hi posarà "Am" per defecte).
 */
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
 * Capo: el text del span `#cifra_capo` ve com "capotraste: 1ª fret" o buit.
 * Extreu el primer número que hi trobi. 0 si no hi ha res.
 */
function parseCapo(raw: string): number {
  if (!raw) return 0
  const m = /(\d+)/.exec(raw)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 0
}

/**
 * Idioma de la pàgina segons l'atribut lang del <html>:
 *   ca_ES → "ca", es_ES → "es", en → "en", pt_BR → "other" (no usat a l'app)
 */
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
