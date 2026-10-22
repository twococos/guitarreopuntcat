/**
 * src/lib/player/voicings.ts — Acord → posició real de guitarra (afinació estàndard).
 *
 * Primer es busca una posició oberta coneguda; si no n'hi ha, una cejilla amb forma de Mi o de La
 * (la del trast més baix). Un acord amb baix ("C/E") el posa a la sisena o a la cinquena corda si
 * hi cap a prop de la posició. Les extensions que una guitarra d'acompanyament no faria es
 * redueixen a la qualitat més propera (9 → 7, m9 → m7…).
 *
 * Pur. Cordes indexades de greu (0, Mi greu) a aguda (5, Mi agut).
 */

/** MIDI de les cordes a l'aire: E2 A2 D3 G3 B3 E4. */
export const TUNING = [40, 45, 50, 55, 59, 64] as const

export type Quality =
  | "maj" | "m" | "7" | "maj7" | "m7" | "m7b5" | "dim" | "dim7" | "aug"
  | "sus4" | "sus2" | "7sus4" | "6" | "m6" | "add9" | "5"

export interface ParsedChord {
  root: number // classe de nota 0-11
  quality: Quality
  bass: number | null // classe de nota del baix si és un acord amb barra
}

export interface Voicing {
  /** MIDI de cada corda, o null si no sona. */
  strings: (number | null)[]
  /** Corda del baix (la més greu que sona). */
  root: number
  /** Corda del baix alternat (la quinta, si n'hi ha una de greu; si no, la del costat). */
  alt: number
  /** Nota del baix de l'acord (amb barra, el baix), una octava per sota del registre de la guitarra. */
  bassPc: number
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Sufix → qualitat. L'ordre importa: primer els més llargs. */
const QUALITY_RULES: [RegExp, Quality][] = [
  [/^(m7b5|min7b5|-7b5|ø7?)/, "m7b5"],
  [/^(dim7|°7|o7)/, "dim7"],
  [/^(dim|°|o(?![a-z]))/, "dim"],
  [/^(aug|\+)/, "aug"],
  [/^(maj7|maj9|maj13|M7|M9|7M|Δ7?|ma7)/, "maj7"],
  [/^(m6|min6|-6)/, "m6"],
  [/^(m7|m9|m11|m13|min7|min9|-7|-9)/, "m7"],
  [/^(mmaj7|mM7|m\(maj7\))/, "m"],
  [/^(m|min|-)(?!aj)/, "m"],
  [/^(7sus4|7sus|9sus4|9sus)/, "7sus4"],
  [/^(sus4|sus)/, "sus4"],
  [/^sus2/, "sus2"],
  [/^(add9|add2|2)(?!\d)/, "add9"],
  [/^(6\/9|69|6)/, "6"],
  [/^(7|9|11|13)/, "7"],
  [/^5/, "5"],
]

export function parseChord(label: string): ParsedChord | null {
  const m = /^\s*([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?\s*$/.exec(label)
  if (!m) return null
  const pc = (letter: string, acc: string) => (NOTE[letter] + (acc === "#" ? 1 : acc === "b" ? -1 : 0) + 12) % 12
  const root = pc(m[1], m[2])
  const suffix = m[3].replace(/[()\s]/g, "")
  let quality: Quality = "maj"
  for (const [re, q] of QUALITY_RULES) {
    if (re.test(suffix)) {
      quality = q
      break
    }
  }
  const bass = m[4] ? pc(m[4], m[5]) : null
  return { root, quality, bass: bass === root ? null : bass }
}

type Shape = readonly number[] // trast per corda, -1 = no sona

/** Posicions obertes, per arrel (sostinguts) + qualitat. */
const OPEN: Record<string, Shape> = {
  "0maj": [-1, 3, 2, 0, 1, 0],
  "0maj7": [-1, 3, 2, 0, 0, 0],
  "07": [-1, 3, 2, 3, 1, 0],
  "0add9": [-1, 3, 2, 0, 3, 0],
  "0sus4": [-1, 3, 3, 0, 1, 1],
  "2maj": [-1, -1, 0, 2, 3, 2],
  "2m": [-1, -1, 0, 2, 3, 1],
  "27": [-1, -1, 0, 2, 1, 2],
  "2m7": [-1, -1, 0, 2, 1, 1],
  "2maj7": [-1, -1, 0, 2, 2, 2],
  "2sus4": [-1, -1, 0, 2, 3, 3],
  "2sus2": [-1, -1, 0, 2, 3, 0],
  "26": [-1, -1, 0, 2, 0, 2],
  "4maj": [0, 2, 2, 1, 0, 0],
  "4m": [0, 2, 2, 0, 0, 0],
  "47": [0, 2, 0, 1, 0, 0],
  "4m7": [0, 2, 0, 0, 0, 0],
  "4maj7": [0, 2, 1, 1, 0, 0],
  "4sus4": [0, 2, 2, 2, 0, 0],
  "5maj7": [-1, -1, 3, 2, 1, 0],
  "7maj": [3, 2, 0, 0, 0, 3],
  "77": [3, 2, 0, 0, 0, 1],
  "7maj7": [3, 2, 0, 0, 0, 2],
  "7sus4": [3, 3, 0, 0, 1, 3],
  "9maj": [-1, 0, 2, 2, 2, 0],
  "9m": [-1, 0, 2, 2, 1, 0],
  "97": [-1, 0, 2, 0, 2, 0],
  "9m7": [-1, 0, 2, 0, 1, 0],
  "9maj7": [-1, 0, 2, 1, 2, 0],
  "9sus4": [-1, 0, 2, 2, 3, 0],
  "9sus2": [-1, 0, 2, 2, 0, 0],
  "96": [-1, 0, 2, 2, 2, 2],
  "117": [-1, 2, 1, 2, 0, 2],
}

/** Formes mòbils relatives al trast de l'arrel (sisena corda). */
const E_SHAPE: Record<Quality, Shape> = {
  maj: [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  m7b5: [0, 1, 2, 0, 3, 0],
  dim: [0, 1, 2, 0, -1, -1],
  dim7: [0, 1, 2, 0, 2, 0],
  aug: [0, 3, 2, 1, 1, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  sus2: [0, 2, 4, 1, 0, 0],
  "7sus4": [0, 2, 0, 2, 0, 0],
  "6": [0, 2, 2, 1, 2, 0],
  m6: [0, 2, 2, 0, 2, 0],
  add9: [0, 2, 2, 1, 0, 2],
  "5": [0, 2, 2, -1, -1, -1],
}

/** Formes mòbils relatives al trast de l'arrel (cinquena corda). */
const A_SHAPE: Record<Quality, Shape> = {
  maj: [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  m7b5: [-1, 0, 1, 0, 1, -1],
  dim: [-1, 0, 1, 2, 1, -1],
  dim7: [-1, 0, 1, 2, 1, 2],
  aug: [-1, 0, 3, 2, 2, 1],
  sus4: [-1, 0, 2, 2, 3, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  "7sus4": [-1, 0, 2, 0, 3, 0],
  "6": [-1, 0, 2, 2, 2, 2],
  m6: [-1, 0, 2, 2, 1, 2],
  add9: [-1, 0, 2, 4, 2, 0],
  "5": [-1, 0, 2, 2, -1, -1],
}

function shapeFor(root: number, quality: Quality): Shape {
  const open = OPEN[`${root}${quality}`]
  if (open) return open
  const fE = (root - 4 + 12) % 12
  const fA = (root - 9 + 12) % 12
  const [base, fret] = fA < fE ? [A_SHAPE[quality], fA] : [E_SHAPE[quality], fE]
  return base.map((f) => (f < 0 ? -1 : f + fret))
}

/** Posa el baix d'un acord amb barra a la sisena o la cinquena si hi cap a prop de la forma. */
function withBass(shape: Shape, bass: number): Shape {
  const fretted = shape.filter((f) => f > 0)
  const lo = fretted.length ? Math.min(...fretted) : 0
  const hi = fretted.length ? Math.max(...fretted) : 0
  const fits = (f: number) => f === 0 || (hi <= 3 ? f <= 4 : f >= lo - 1 && f <= hi + 1)
  const f1 = (bass - 9 + 12) % 12
  const f0 = (bass - 4 + 12) % 12
  const lowest = shape.findIndex((f) => f >= 0)
  // Cinquena corda (apagant la sisena) si la forma ja comença a la cinquena o més amunt
  if (lowest >= 1 && fits(f1)) return [-1, f1, ...shape.slice(2)]
  if (fits(f0)) return [f0, ...shape.slice(1)]
  if (fits(f1)) return [-1, f1, ...shape.slice(2)]
  return shape
}

const cache = new Map<string, Voicing | null>()

export function voicingFor(label: string): Voicing | null {
  const hit = cache.get(label)
  if (hit !== undefined) return hit
  const chord = parseChord(label)
  let v: Voicing | null = null
  if (chord) {
    let shape = shapeFor(chord.root, chord.quality)
    if (chord.bass !== null) shape = withBass(shape, chord.bass)
    const strings = shape.map((f, i) => (f < 0 ? null : TUNING[i] + f))
    const sounding = strings.map((n, i) => (n === null ? -1 : i)).filter((i) => i >= 0)
    const root = sounding[0]
    const fifth = (chord.root + 7) % 12
    const alt =
      sounding.slice(1, 3).find((i) => (strings[i] as number) % 12 === fifth) ??
      sounding.find((i) => i > root) ??
      root
    v = { strings, root, alt, bassPc: chord.bass ?? chord.root }
  }
  cache.set(label, v)
  return v
}

/** Les `n` cordes més agudes que sonen, de greu a aguda. */
export function topStrings(v: Voicing, n: number): number[] {
  const sounding = v.strings.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0)
  return sounding.slice(Math.max(sounding.length - n, 0))
}

/** Les `n` cordes més greus que sonen, de greu a aguda. */
export function lowStrings(v: Voicing, n: number): number[] {
  return v.strings.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0).slice(0, n)
}

/** MIDI del baix elèctric: arrel entre E1 (28) i D#2 (39). */
export function bassMidi(pc: number, interval = 0): number {
  const n = 28 + ((pc + interval - 4 + 24) % 12)
  return n
}
