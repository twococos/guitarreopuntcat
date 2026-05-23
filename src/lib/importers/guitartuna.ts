/**
 * Importador per a guitartuna.com
 *
 * L'HTML d'una cançó és server-rendered (HTTP simple basta — no cal Puppeteer).
 * Metadades dins un <script type="application/ld+json"> amb un objecte
 * MusicComposition (name, composer.name, musicalKey, inLanguage, text).
 *
 * El cos està a `#songcontent` amb aquesta estructura:
 *
 *   <div id="songcontent">
 *     <div>
 *       <div class="partContainer"><div class="part_type">Intro 1</div>…</div>
 *       <div class="line" data-bar="0">
 *         <span class="beat">
 *           <div class="beat_info" style="width:calc(var(--font-width) * 3);
 *                                          margin-left:calc(var(--font-width) * 0)">
 *             <span class="chordLabel">D </span>
 *             …(tooltip amb diagrama)…
 *           </div>
 *         </span>
 *         <span class="beat">…</span>
 *         …
 *         <div class="white-space whitespace-pre">Same bed but it feels</div>
 *       </div>
 *       …més .line…
 *     </div>
 *     …més blocs (partContainer + .line)…
 *   </div>
 *
 * - `var(--font-width)` és l'amplada d'un caràcter monoespaciat — les unitats
 *   width/margin-left dels beats coincideixen directament amb la posició en
 *   columnes dins la línia de lletra.
 * - Cada `.line` representa una línia visual amb la seva pròpia lletra al
 *   final (l'últim <div.white-space>).
 */

import { parse, type HTMLElement } from "node-html-parser"
import type { Importer, ImportResult } from "./types"
import { defaultFetch } from "./fetch"

export const guitarTuna: Importer = {
  host: "guitartuna.com",

  match(url) {
    const h = url.hostname.toLowerCase()
    return h === "guitartuna.com" || h === "www.guitartuna.com"
  },

  fetch: defaultFetch,

  parse(html, _url): ImportResult {
    const root = parse(html)

    // ── Metadades via JSON-LD ──
    const meta = extractJsonLdMeta(root)

    // ── Cos ──
    const song = root.querySelector("#songcontent")
    if (!song) throw new Error("No s'ha trobat #songcontent")

    const content = buildContent(song)

    return {
      title: meta.title || "Sense títol",
      artist: meta.artist || "Desconegut",
      key: meta.key || "Am",
      capo: meta.capo,
      language: meta.language,
      tags: "",
      content,
    }
  },
}

/* ──────────────────────────── Construcció del contingut ──────────────────────────── */

interface ChordPos {
  chord: string
  col: number
}

/**
 * Travessa els fills de #songcontent. Aquest té un nivell de divs wrapper:
 * `<div>(partContainer + N lines)</div>`. Cada wrapper representa una secció.
 * Emetem `<sec>Nom</sec>` seguit de les línies fusionades acord+lletra.
 */
function buildContent(songEl: HTMLElement): string {
  const out: string[] = []

  // Cerquem tots els partContainer (encara que estiguin niuats sota wrappers).
  // Per a cada partContainer, agafem les .line que el segueixen al mateix nivell
  // (siblings del mateix parent), fins al següent partContainer o final.
  const parts = songEl.querySelectorAll(".partContainer")

  for (let pi = 0; pi < parts.length; pi++) {
    const partEl = parts[pi]
    const partName = textOf(partEl.querySelector(".part_type"))
    if (partName) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("")
      out.push(`<sec>${partName}</sec>`)
    }

    // Iterar els siblings posteriors al partContainer dins el mateix parent
    const parent = partEl.parentNode
    if (!parent) continue
    const sibs = parent.childNodes
    let seen = false
    for (const s of sibs) {
      if (s === partEl) {
        seen = true
        continue
      }
      if (!seen) continue
      // node-html-parser ELEMENT_NODE = 1
      if (s.nodeType !== 1) continue
      const el = s as HTMLElement
      const cls = el.classList?.value ?? []
      if (cls.includes("partContainer")) break // fi de la secció
      if (!cls.includes("line")) continue

      const lineStr = renderLine(el)
      if (lineStr !== null) out.push(lineStr)
    }
  }

  // Treure blanks al principi/final
  while (out.length > 0 && out[0] === "") out.shift()
  while (out.length > 0 && out[out.length - 1] === "") out.pop()

  return out.join("\n")
}

/**
 * Reconstrueix una línia fusionant acords i lletra. Retorna null si la línia
 * resultant és buida (no té ni acord ni lletra).
 */
function renderLine(line: HTMLElement): string | null {
  const beats = line.querySelectorAll(".beat")
  const chords: ChordPos[] = []
  let col = 0
  for (const b of beats) {
    const info = b.querySelector(".beat_info")
    const style = info?.getAttribute("style") ?? ""
    const w = parseFontWidth(style, "width")
    const ml = parseFontWidth(style, "margin-left")
    const chordRaw = textOf(b.querySelector(".chordLabel"))
    if (chordRaw) {
      const chord = normalizeChord(chordRaw)
      if (chord) chords.push({ chord, col: col + ml })
    }
    col += ml + w
  }

  const lyrics = extractLyrics(line)

  if (chords.length === 0 && lyrics.trim() === "") return null
  if (chords.length === 0) return lyrics

  // Inserir acords a les columnes en ordre invers per no desplaçar índexs.
  const sorted = [...chords].sort((a, b) => b.col - a.col)
  const maxCol = sorted.length > 0 ? Math.ceil(sorted[0].col) : 0
  let out = lyrics
  if (out.length < maxCol) out = out.padEnd(maxCol, " ")
  for (const c of sorted) {
    const i = Math.min(out.length, Math.round(c.col))
    out = out.slice(0, i) + `<ch>${c.chord}</ch>` + out.slice(i)
  }
  return out
}

/**
 * La lletra d'una .line és el primer <div class="white-space whitespace-pre">
 * que conté text no buit i no és part d'un tooltip.
 */
function extractLyrics(line: HTMLElement): string {
  const candidates = line.querySelectorAll(".whitespace-pre")
  for (const c of candidates) {
    // Excloure els que estan dins d'un beat (per defensar contra possibles
    // matches dins els tooltips d'acord).
    if (c.closest(".beat")) continue
    const txt = c.text
    if (txt && txt.trim()) return txt
  }
  return ""
}

/**
 * Parseja `calc(var(--font-width) * N)` per a la propietat indicada.
 */
function parseFontWidth(style: string, prop: "width" | "margin-left"): number {
  const re = new RegExp(
    `${prop}\\s*:\\s*calc\\(\\s*var\\(--font-width\\)\\s*\\*\\s*(\\d+\\.?\\d*)`,
    "i",
  )
  const m = re.exec(style)
  return m ? parseFloat(m[1]) : 0
}

/* ──────────────────────────── Metadades (JSON-LD) ──────────────────────────── */

interface JsonLdMeta {
  title: string
  artist: string
  key: string
  capo: number
  language: string
}

function extractJsonLdMeta(root: HTMLElement): JsonLdMeta {
  let title = ""
  let artist = ""
  let key = ""
  let capo = 0
  let language = "en"

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.text
    if (!raw) continue
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      continue
    }
    // Pot ser un objecte o un array
    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const it = item as Record<string, unknown>
      if (it["@type"] !== "MusicComposition") continue

      const name = typeof it.name === "string" ? it.name : ""
      if (name) title = cleanTitle(name)

      const composer = it.composer as Record<string, unknown> | undefined
      if (composer && typeof composer.name === "string") {
        artist = composer.name
      }

      const musicalKey = typeof it.musicalKey === "string" ? it.musicalKey : ""
      if (musicalKey) key = normalizeKey(musicalKey)

      const lang = typeof it.inLanguage === "string" ? it.inLanguage : ""
      if (lang) language = normalizeLanguage(lang)

      const text = typeof it.text === "string" ? it.text : ""
      if (text) {
        capo = parseCapoFromText(text)
        // Si encara no tenim clau, mirem si està dins "text"
        if (!key) {
          const km = /Key:\s*([A-G][#b]?\s*(?:major|minor|m)?)/i.exec(text)
          if (km) key = normalizeKey(km[1])
        }
      }
    }
    if (title || artist) break
  }

  return { title, artist, key, capo, language }
}

/**
 * "When I Was Your Man (chords)" → "When I Was Your Man"
 * "Creep (chords)" → "Creep"
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*\((chords?|cifra|acordes?|tabs?)\)\s*$/i, "")
    .trim()
}

/**
 * "C major" → "C"; "G major" → "G"; "A minor" → "Am"; "C#" → "C#";
 * "Db" → "C#" (bemoll → sostingut).
 */
function normalizeKey(raw: string): string {
  const t = raw.trim()
  const m = /^([A-G])(#|b)?\s*(major|maj|minor|min|m)?$/i.exec(t)
  if (!m) return ""
  let root = m[1].toUpperCase()
  const accidental = m[2]
  if (accidental === "#") root += "#"
  else if (accidental?.toLowerCase() === "b") {
    const flat = `${root}b`
    root = FLAT_TO_SHARP[flat] ?? root
  }
  const quality = m[3]?.toLowerCase() ?? ""
  const isMinor = quality === "minor" || quality === "min" || quality === "m"
  return isMinor ? `${root}m` : root
}

/** "Capo: fret 7" → 7. "No capo" o sense match → 0. */
function parseCapoFromText(text: string): number {
  if (/no\s*capo|sin\s*cejilla|sense\s*cejilla/i.test(text)) return 0
  const m = /Capo:\s*(?:fret\s*)?(\d+)/i.exec(text)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 0
}

function normalizeLanguage(lang: string): string {
  const l = lang.toLowerCase()
  if (l.startsWith("ca")) return "ca"
  if (l.startsWith("es")) return "es"
  if (l.startsWith("en")) return "en"
  return "other"
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
}
