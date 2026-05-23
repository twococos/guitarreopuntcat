/**
 * Importador per a www.acordscatala.cat
 *
 * L'HTML d'una cançó té aquesta estructura:
 *   <div id="canco">
 *     <h1>Títol</h1>
 *     <h2 class="nom_grup"><a>Artista</a></h2>
 *     <div class="canco-container">
 *       <pre>
 *         text amb fragments <u>…</u> (i a vegades <strong><u>…</u></strong>)
 *         on cada <u> és una línia (o seqüència) d'acords.
 *         La línia immediatament posterior (text pla) és la lletra,
 *         i la posició dels acords sobre la lletra ve donada pel
 *         nombre d'espais entre acords dins la línia d'acords.
 *       </pre>
 *     </div>
 *   </div>
 *
 * Els acords es donen en notació catalana/italiana (DO, RE, MI, FA, SOL, LA, SI)
 * i poden contenir '→' per indicar transicions ràpides (DO#→DO#sus2).
 */

import { parse, type HTMLElement } from "node-html-parser"
import type { Importer, ImportResult } from "./types"
import { defaultFetch } from "./fetch"

export const acordsCatala: Importer = {
  host: "www.acordscatala.cat",

  match(url) {
    const h = url.hostname.toLowerCase()
    return h === "www.acordscatala.cat" || h === "acordscatala.cat"
  },

  fetch: defaultFetch,

  parse(html, _url): ImportResult {
    const root = parse(html)
    const canco = root.querySelector("#canco")
    if (!canco) throw new Error("No s'ha trobat el bloc #canco")

    const title = textOf(canco.querySelector("h1"))
    const artist = textOf(canco.querySelector("h2.nom_grup"))
    const pre = canco.querySelector(".canco-container pre") ?? canco.querySelector("pre")
    if (!pre) throw new Error("No s'ha trobat el <pre> amb la cançó")

    const lines = extractLines(pre)
    const { content, detectedKey } = buildContent(lines)

    return {
      title: title || "Sense títol",
      artist: artist || "Desconegut",
      key: detectedKey ?? "Am",
      capo: 0,
      language: "ca",
      tags: "",
      content,
    }
  },
}

/* ──────────────────────────── Extracció estructurada ──────────────────────────── */

type LineBody =
  | { type: "chords"; tokens: ChordToken[] }
  | { type: "lyric"; text: string }
  | { type: "mixed"; plainText: string; tokens: ChordToken[] }
  | { type: "blank" }

type Line = LineBody & { inStrong: boolean }

interface ChordToken {
  /** Acord ja normalitzat (notació anglesa, amb sostinguts). */
  chord: string
  /** Columna (0-based) dins la línia d'acords on apareix. */
  col: number
}

/**
 * node-html-parser tracta tot el contingut de <pre> com a un únic TEXT_NODE
 * sense descendir a les etiquetes <u>/<strong> que hi ha a dins. Per això
 * processem el rawText manualment, marcant les zones amb caràcters de
 * control que conserven la geometria visual.
 *
 * Marcadors:
 *   \x01 = obre <u>      \x02 = tanca </u>
 *   \x03 = obre <strong> \x04 = tanca </strong>
 *
 * El <strong> de acordscatala marca les TORNADES; el seguiment es propaga
 * línia a línia per emetre <sec>Tornada</sec>/<sec>Estrofa N</sec> més tard.
 */
function extractLines(pre: HTMLElement): Line[] {
  let raw = pre.rawText ?? pre.textContent ?? ""
  raw = raw.replace(/<strong[^>]*>/gi, "\x03").replace(/<\/strong>/gi, "\x04")
  raw = raw.replace(/<u[^>]*>/gi, "\x01").replace(/<\/u>/gi, "\x02")
  raw = decode(raw)
  raw = raw.replace(/\r\n?/g, "\n")

  const rawLines = raw.split("\n")
  const lines: Line[] = []
  let carryInsideChord = false
  let carryInsideStrong = false
  for (const r of rawLines) {
    const { line, endsInsideChord, endsInsideStrong } = parseLineMulti(
      r,
      carryInsideChord,
      carryInsideStrong,
    )
    lines.push(line)
    carryInsideChord = endsInsideChord
    carryInsideStrong = endsInsideStrong
  }
  return lines
}

/**
 * Parseja una línia tenint en compte que pot començar dins un <u>/<strong>
 * obert a la línia anterior, i pot acabar dins un <u>/<strong> sense tancar.
 *
 * Una línia es considera "inStrong" si està majoritàriament dins <strong>
 * (començar i acabar dins; o, si conté \x03/\x04 a dins, considerem que el
 * tros majoritari mana — heurística pragmàtica per a acordscatala).
 */
function parseLineMulti(
  raw: string,
  startInsideChord: boolean,
  startInsideStrong: boolean,
): { line: Line; endsInsideChord: boolean; endsInsideStrong: boolean } {
  let chordDepth = startInsideChord ? 1 : 0
  let strongDepth = startInsideStrong ? 1 : 0

  // Comptem caràcters visibles dins/fora de <strong> per decidir inStrong per
  // majoria. Cas problemàtic: "</strong><u>…</u><strong>" — la línia comença
  // dins strong però el contingut significatiu és fora.
  let charsInStrong = 0
  let charsOutsideStrong = 0
  for (const c of raw) {
    if (c === "\x01") chordDepth++
    else if (c === "\x02") chordDepth--
    else if (c === "\x03") strongDepth++
    else if (c === "\x04") strongDepth--
    else if (!/\s/.test(c)) {
      if (strongDepth > 0) charsInStrong++
      else charsOutsideStrong++
    }
  }
  const endsInsideChord = chordDepth > 0
  const endsInsideStrong = strongDepth > 0

  // inStrong = la majoria del contingut visible està dins <strong>.
  // En cas d'empat (o línia sense contingut visible) ens basem en si comença
  // dins strong.
  let inStrong: boolean
  if (charsInStrong > charsOutsideStrong) inStrong = true
  else if (charsOutsideStrong > charsInStrong) inStrong = false
  else inStrong = startInsideStrong

  // Eliminem els marcadors \x03/\x04 del raw abans de processar (no afecten
  // ni columnes ni text visible). \x01/\x02 sí els necessita parseLine.
  let prefixed = raw.replace(/[\x03\x04]/g, "")
  if (startInsideChord) prefixed = "\x01" + prefixed
  if (endsInsideChord) prefixed = prefixed + "\x02"

  const body = parseLine(prefixed)
  return { line: { ...body, inStrong }, endsInsideChord, endsInsideStrong }
}

function parseLine(raw: string): LineBody {
  // Una línia pot contenir trossos d'acord marcats amb \x01…\x02 i text pla.
  // Si tots els trossos plain de la línia són només espais (o buits) i hi ha
  // almenys un tros chord, és una línia d'acords. Altrament, és lletra.
  let hasChord = false
  let allPlainBlank = true
  let plainConcat = ""

  // Reconstrucció d'una versió "neta" sense els marcadors, per calcular columnes
  // (els marcadors no ocupen visualment cap espai a l'usuari original).
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
      hasChord = true
      i = end === -1 ? raw.length : end + 1
    } else {
      const next1 = raw.indexOf("\x01", i)
      const slice = next1 === -1 ? raw.slice(i) : raw.slice(i, next1)
      segs.push({ kind: "plain", text: slice, col: visual.length })
      visual += slice
      plainConcat += slice
      if (slice.trim() !== "") allPlainBlank = false
      i = next1 === -1 ? raw.length : next1
    }
  }

  if (visual.trim() === "") return { type: "blank" }

  // Cas A: tots els segments plain entre els acords són només espais → línia d'acords pura
  if (hasChord && allPlainBlank) {
    const tokens = extractChordTokens(segs)
    if (tokens.length > 0) return { type: "chords", tokens }
    // Si no s'han pogut extreure tokens, ho tractem com a lletra
  }

  // Cas B: línia mixta (ex: "Intro: <u>SIbm FA# DO#</u> x2"):
  //   text fora dels acords + acords vàlids. Ho emetem com a "mixed" perquè
  //   buildContent decideixi si fer-ne secció + línia d'acords.
  if (hasChord) {
    const tokens = extractChordTokens(segs)
    if (tokens.length > 0) {
      return { type: "mixed", plainText: plainConcat, tokens }
    }
  }

  // Cas C: lletra pura
  return { type: "lyric", text: visual }
}

function extractChordTokens(
  segs: { kind: "plain" | "chord"; text: string; col: number }[],
): ChordToken[] {
  // Concatenem tot el text "chord" en una sola seqüència però recordant la
  // columna inicial de cada caràcter. Després partim per espais i validem cada
  // token com a acord; descartem tokens no vàlids (rares vegades hi ha
  // anotacions com "x2" dins el <u>).
  const tokens: ChordToken[] = []
  for (const seg of segs) {
    if (seg.kind !== "chord") continue
    // Iterem el text del segment per trobar grups de no-espais
    let j = 0
    while (j < seg.text.length) {
      // Saltar espais
      while (j < seg.text.length && /\s/.test(seg.text[j])) j++
      if (j >= seg.text.length) break
      const start = j
      while (j < seg.text.length && !/\s/.test(seg.text[j])) j++
      const word = seg.text.slice(start, j)
      const normalized = normalizeChord(word)
      if (normalized) {
        tokens.push({ chord: normalized, col: seg.col + start })
      }
    }
  }
  return tokens
}

/* ──────────────────────────── Construcció del contingut ──────────────────────────── */

function buildContent(lines: Line[]): { content: string; detectedKey: string | null } {
  const out: string[] = []
  let detectedKey: string | null = null

  // Seguiment de seccions: acordscatala marca les TORNADES amb <strong>.
  // - Abans del primer bloc de contingut no-strong → <sec>Estrofa 1</sec>.
  // - En entrar a un bloc strong → <sec>Tornada</sec>.
  // - En sortir cap a contingut no-strong → <sec>Estrofa N</sec> (N incremental).
  // Les línies blank no canvien l'estat.
  let strongActive = false
  let estrofaCounter = 0
  let estrofaEmitted = false // ha sortit ja un <sec>Estrofa…</sec> per al bloc actual?
  let tornadaEmitted = false // ídem per a <sec>Tornada</sec>
  let firstContentSeen = false

  const emitSectionForLine = (isStrong: boolean): void => {
    if (isStrong) {
      if (!tornadaEmitted) {
        out.push("<sec>Tornada</sec>")
        tornadaEmitted = true
        estrofaEmitted = false
      }
    } else {
      if (!estrofaEmitted) {
        estrofaCounter += 1
        out.push(`<sec>Estrofa ${estrofaCounter}</sec>`)
        estrofaEmitted = true
        tornadaEmitted = false
      }
    }
  }

  const noteTransition = (isStrong: boolean): void => {
    if (!firstContentSeen) {
      firstContentSeen = true
      strongActive = isStrong
      emitSectionForLine(isStrong)
      return
    }
    if (isStrong !== strongActive) {
      strongActive = isStrong
      emitSectionForLine(isStrong)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.type === "blank") {
      out.push("")
      continue
    }

    if (line.type === "chords") {
      if (detectedKey === null && line.tokens.length > 0) {
        detectedKey = keyFromFirstChord(line.tokens[0].chord)
      }
      const next = lines[i + 1]
      // Per a una línia d'acords, la "secció" la determina la línia de lletra
      // que la segueix (si n'hi ha). Si no, la de la pròpia línia d'acords.
      const refStrong = next && next.type === "lyric" ? next.inStrong : line.inStrong
      noteTransition(refStrong)
      if (next && next.type === "lyric") {
        out.push(mergeChordsIntoLyric(line.tokens, next.text))
        i++ // Hem consumit la línia de lletra
      } else {
        out.push(chordLine(line.tokens))
      }
      continue
    }

    if (line.type === "mixed") {
      if (detectedKey === null && line.tokens.length > 0) {
        detectedKey = keyFromFirstChord(line.tokens[0].chord)
      }
      // Acordscatala no marca seccions amb text (només amb negreta = tornada),
      // així que el text intercalat es descarta. Emetem només els acords.
      noteTransition(line.inStrong)
      out.push(chordLine(line.tokens))
      continue
    }

    // line.type === "lyric"
    noteTransition(line.inStrong)
    out.push(line.text)
  }

  // Treu línies en blanc al principi i al final, però conserva les internes
  while (out.length > 0 && out[0] === "") out.shift()
  while (out.length > 0 && out[out.length - 1] === "") out.pop()

  return { content: out.join("\n"), detectedKey }
}

function mergeChordsIntoLyric(tokens: ChordToken[], lyric: string): string {
  // Inserim els acords en ordre invers (de més gran a més petit col) perquè
  // les insercions anteriors no afectin els índexs de les posteriors.
  const sorted = [...tokens].sort((a, b) => b.col - a.col)
  // Si la lletra és més curta que la columna màxima, l'estenem amb espais.
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

// Mapping notació catalana/italiana → anglesa
const NOTE_MAP: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
}

// Bemolls → sostinguts (consistent amb ALL_KEYS de transpose.ts)
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
 * Valida i normalitza un token a acord en notació anglesa amb sostinguts.
 * Retorna null si el token no sembla un acord.
 *
 * Cas especial: "DO#→DO#sus2" (transició) → es preserva tal qual amb la fletxa,
 * normalitzant cada part. La UI ja sap mostrar acords compostos.
 */
function normalizeChord(rawToken: string): string | null {
  // Treure puntuació al voltant però conservar # b → / dins l'acord
  const token = rawToken.replace(/[,;.]+$/, "")
  if (token.length === 0) return null

  // Fletxa de transició (→ o ->): partim, normalitzem cada banda, tornem a unir
  if (token.includes("→") || token.includes("->")) {
    const parts = token.split(/→|->/).map((p) => normalizeSingleChord(p))
    if (parts.some((p) => p === null)) return null
    return parts.join("→")
  }

  // Slash chord (DO/SOL → C/G): normalitzem cada banda
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

  // 1) Intentar notació catalana (DO, RE, MI, FA, SOL, LA, SI) — sensible a longitud
  //    Provem primer el prefix més llarg (SOL, MIb, etc.)
  const upper = token.toUpperCase()
  for (const cat of ["SOL", "DO", "RE", "MI", "FA", "LA", "SI"]) {
    if (upper.startsWith(cat)) {
      const rest = token.slice(cat.length)
      const note = NOTE_MAP[cat]
      return finalize(note, rest)
    }
  }

  // 2) Notació anglesa directa (per si algun dia apareix)
  const m = /^([A-G])(.*)$/.exec(token)
  if (m) return finalize(m[1], m[2])

  return null
}

function finalize(rootLetter: string, rest: string): string | null {
  // rest pot començar amb #, b, o directament amb el sufix (m, sus, 7, etc.)
  let root = rootLetter
  let suffix = rest
  if (suffix.startsWith("#")) {
    root += "#"
    suffix = suffix.slice(1)
  } else if (suffix.startsWith("b") || suffix.startsWith("B")) {
    // 'b' minúscula al començament és bemoll; majúscula podria ser ambigua,
    // però com que el root ja és una sola lletra, qualsevol B inicial al rest
    // és bemoll. Igualment normalitzem.
    const flat = `${rootLetter}b`
    if (FLAT_TO_SHARP[flat]) {
      root = FLAT_TO_SHARP[flat]
      suffix = suffix.slice(1)
    }
  }
  // Validació sufix mínima: lletres, números, barres i símbols comuns d'acord
  if (!/^[a-zA-Z0-9+°ºø/()#]*$/.test(suffix)) return null
  // Normalitza casos com "m7" (la 'm' minúscula es manté). Si el sufix
  // comença amb "M" majúscula sola, podria ser ambigua (mol·les m → M?).
  // Acordscatala usa "m" minúscula per a menor, així que ho deixem.
  return root + suffix
}

function keyFromFirstChord(chord: string): string {
  // L'acord ja està normalitzat. Per al "key" volem només l'arrel + 'm' si és menor.
  const m = /^([A-G]#?)(m)?/.exec(chord)
  if (!m) return "Am"
  const root = m[1]
  const minor = m[2] === "m"
  return minor ? `${root}m` : root
}

/* ──────────────────────────── Helpers ──────────────────────────── */

function textOf(el: HTMLElement | null): string {
  if (!el) return ""
  return decode(el.text).trim().replace(/\s+/g, " ")
}

/**
 * Decodifica entitats HTML comunes (acordscatala usa numèriques i nominals).
 * node-html-parser NO decodifica entitats al rawText, així que ho fem manualment.
 */
function decode(s: string): string {
  return s
    .replace(/&rarr;/g, "→")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&([a-z]+);/g, (m, name: string) => HTML_ENTITIES[name] ?? m)
}

// Subconjunt suficient per a acordscatala (català + caràcters habituals).
const HTML_ENTITIES: Record<string, string> = {
  agrave: "à",
  egrave: "è",
  igrave: "ì",
  ograve: "ò",
  ugrave: "ù",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Agrave: "À",
  Egrave: "È",
  Igrave: "Ì",
  Ograve: "Ò",
  Ugrave: "Ù",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ouml: "ö",
  uuml: "ü",
  euml: "ë",
  iuml: "ï",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  auml: "ä",
}
