/**
 * src/lib/transcriber/syncText.ts — Utilitats de text i d'acords per a sync.ts.
 * Pures (sense Node ni BD): s'executen igual al servidor i al navegador.
 *
 * Les regles de normalització i de repeticions són les del transcriptor
 * (src/transcriptor/text.py i stages/lyrics_source.py), perquè el content
 * s'interpreti igual que quan es va fer l'anàlisi.
 */

// ── Entitats HTML ─────────────────────────────────────────────────────────────
// N'hi ha a la BD per culpa dels importadors ("l&rsquo;aire", "&Eacute;s").

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»",
  hellip: "…", middot: "·", ndash: "–", mdash: "—", iexcl: "¡", iquest: "¿",
}

const COMBINING: Record<string, string> = {
  acute: "́", grave: "̀", uml: "̈", circ: "̂", tilde: "̃", cedil: "̧",
}

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi
const ACCENT_ENTITY_RE = /^([a-z])(acute|grave|uml|circ|tilde|cedil)$/i

/** Descodifica entitats HTML. El ";" és opcional: a la BD hi ha "l&rsquo<ch>C</ch>;horitzó". */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text
  return text.replace(ENTITY_RE, (whole, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x"
      const cp = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()]
    if (named !== undefined) return named
    const accent = ACCENT_ENTITY_RE.exec(entity)
    if (accent) return (accent[1] + COMBINING[accent[2].toLowerCase()]).normalize("NFC")
    return whole
  })
}

// ── Normalització ─────────────────────────────────────────────────────────────

const SUBWORD_RE = /[\p{L}\p{M}\p{N}_·]+/gu

/** Subparaules en minúscula sense puntuació. "L'avi" → ["l", "avi"]; conserva accents i l·l. */
export function normalize(text: string): string[] {
  const t = text.toLowerCase().normalize("NFC").replace(/’/g, "'").replace(/l\.l/g, "l·l")
  return t.match(SUBWORD_RE) ?? []
}

/** Similitud entre dues subparaules (0-1): 2·LCS / (|a|+|b|), equivalent a SequenceMatcher.ratio(). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const la = a.length
  const lb = b.length
  if (la === 0 || lb === 0) return 0
  let prev = new Uint16Array(lb + 1)
  let cur = new Uint16Array(lb + 1)
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    ;[prev, cur] = [cur, prev]
  }
  return (2 * prev[lb]) / (la + lb)
}

// ── Marques de repetició ──────────────────────────────────────────────────────

/** Línia que només és una marca: "x2", "2x", "(x2)", "bis". Repeteix el bloc anterior. */
export const REPEAT_ALONE_RE = /^[([]?\s*(?:x\s*(\d+)|(\d+)\s*x|(bis))\s*[)\]]?$/i
/** Marca al final d'una línia: "… (x2)". Repeteix aquella línia. */
export const REPEAT_END_RE = /\s*[([]\s*(?:x\s*(\d+)|(\d+)\s*x|(bis))\s*[)\]]\s*$/i
/** Marca sense parèntesis al final d'una línia: "… x3" (el transcriptor no la reconeix). */
export const REPEAT_END_BARE_RE = /\s+x\s*(\d+)()()\s*$/i
/** Paraula que és una marca i no es canta. */
export const MARKER_TOKEN_RE = /^[([]?x\d+[)\]]?$/i

const MAX_REPEATS = 8

export function repeatCount(m: RegExpExecArray): number {
  const n = m[3] ? 2 : parseInt(m[1] || m[2], 10)
  return Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), MAX_REPEATS)
}

// ── Acords ────────────────────────────────────────────────────────────────────

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Classe majmin d'un acord: arrel (0-11) i si és menor. null si no és un acord reconegut. */
export interface ChordClass {
  root: number
  minor: boolean
}

export function chordClass(label: string): ChordClass | null {
  const m = /^\s*([A-G])([#b]?)(.*)$/.exec(label)
  if (!m) return null
  const root = NOTE_INDEX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)
  const quality = m[3].split("/")[0]
  return { root: (root + 12) % 12, minor: /^(m(?!aj)|min|dim|-)/.test(quality) }
}

export function sameClass(a: ChordClass | null, b: ChordClass | null, shift = 0): boolean {
  return a !== null && b !== null && (a.root + shift + 12) % 12 === b.root && a.minor === b.minor
}

/** "G→Bm→C" → ["G", "Bm", "C"]. A la BD, una cadena dins un sol <ch> vol dir acords seguits. */
export function splitChain(chord: string): string[] {
  return chord
    .split(/\s*(?:→|->)\s*/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}
