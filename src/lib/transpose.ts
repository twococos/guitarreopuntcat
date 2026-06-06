/**
 * src/lib/transpose.ts — Motor de transposició
 *
 * Port directe de shared/transpose.js a TypeScript.
 * Format de les cançons: acords marcats amb <ch>X</ch>,
 * seccions marcades amb <sec>X</sec>.
 */

export const CHROMATIC = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const

export type ChromaticNote = (typeof CHROMATIC)[number]

const FLAT_MAP: Record<string, ChromaticNote> = {
  Db: "C#",
  Eb: "D#",
  Fb: "E",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
}

/* ── Notació enharmònica (respelling sostingut ⇄ bemoll) ──── */

/** Les 5 notes negres, identificades per la seva forma en sostingut. */
export const ENHARMONIC_NOTES = ["C#", "D#", "F#", "G#", "A#"] as const
export type EnharmonicNote = (typeof ENHARMONIC_NOTES)[number]

/** Per cada nota negra: true = mostrar bemoll, false = mostrar sostingut. */
export type AccidentalMap = Record<EnharmonicNote, boolean>

export const ALL_SHARPS: AccidentalMap = {
  "C#": false,
  "D#": false,
  "F#": false,
  "G#": false,
  "A#": false,
}

export const ALL_FLATS: AccidentalMap = {
  "C#": true,
  "D#": true,
  "F#": true,
  "G#": true,
  "A#": true,
}

/** Equivalent bemoll de cada nota negra (forma en sostingut → bemoll). */
export const SHARP_TO_FLAT: Record<EnharmonicNote, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
}

/**
 * Reescriu les notes negres d'una cadena (nota, acord o key) segons el mapa.
 * S'aplica DESPRÉS de transposar, perquè el motor sempre normalitza a sostinguts.
 * Opera nota a nota amb el mateix patró que la resta del motor.
 */
export function respellAccidentals(text: string, map: AccidentalMap): string {
  return text.replace(/[A-G]#/g, (n) =>
    map[n as EnharmonicNote] ? SHARP_TO_FLAT[n as EnharmonicNote] : n,
  )
}

/**
 * Variant de `respellAccidentals` per a contingut amb tags <ch>...</ch>.
 * Reusa el patró de `transposeContent`.
 */
export function respellContent(content: string, map: AccidentalMap): string {
  return content.replace(
    /(<ch>)([^<]+)(<\/ch>)/g,
    (_, open: string, chord: string, close: string) =>
      `${open}${respellAccidentals(chord, map)}${close}`,
  )
}

/** Tots els tons disponibles (per als selectors). */
export const ALL_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bm",
] as const

export type Key = (typeof ALL_KEYS)[number] | string

/** Graus de l'escala per generar acords del to (en semitons des de la tònica). */
const SCALE_DEGREES = {
  major: [
    { interval: 0, suffixes: ["", "maj7", "6", "sus2", "sus4", "add9"] },
    { interval: 2, suffixes: ["m", "m7", "sus4"] },
    { interval: 4, suffixes: ["m", "m7"] },
    { interval: 5, suffixes: ["", "maj7", "7"] },
    { interval: 7, suffixes: ["", "7", "sus4"] },
    { interval: 9, suffixes: ["m", "m7"] },
    { interval: 11, suffixes: ["dim", "m7b5"] },
  ],
  minor: [
    { interval: 0, suffixes: ["m", "m7", "mmaj7"] },
    { interval: 2, suffixes: ["dim", "m7b5"] },
    { interval: 3, suffixes: ["", "maj7"] },
    { interval: 5, suffixes: ["m", "m7"] },
    { interval: 7, suffixes: ["m", "7"] },
    { interval: 8, suffixes: ["", "maj7"] },
    { interval: 10, suffixes: ["", "7"] },
  ],
} as const

export interface ChordsForKey {
  diatonic: string[]
  secondary: string[]
}

/* ── Funcions bàsiques ───────────────────────────────────── */

/** Transposa una nota individual N semitons. */
export function transposeNote(note: string, semitones: number): string {
  const norm = (FLAT_MAP[note] as string | undefined) ?? note
  const idx = (CHROMATIC as readonly string[]).indexOf(norm)
  if (idx === -1) return note
  return CHROMATIC[(idx + semitones + 12 * 12) % 12]
}

/** Transposa un acord complet (inclou baix si té "/X"). */
export function transposeChord(chord: string, semitones: number): string {
  return chord.replace(/[A-G][b#]?/g, (n) => transposeNote(n, semitones))
}

/** Transposa el to d'una cançó (camp `key`). */
export function transposeKey(key: string, semitones: number): string {
  if (semitones === 0) return key
  return key.replace(/[A-G][b#]?/g, (n) => transposeNote(n, semitones))
}

/**
 * Transposa tot el contingut d'una cançó.
 * Reconeix acords dins de <ch>...</ch>.
 */
export function transposeContent(content: string, semitones: number): string {
  if (semitones === 0) return content
  return content.replace(
    /(<ch>)([^<]+)(<\/ch>)/g,
    (_, open: string, chord: string, close: string) =>
      `${open}${transposeChord(chord.trim(), semitones)}${close}`,
  )
}

/* ── Generació d'acords per to ───────────────────────────── */

/**
 * Retorna els acords diatònics i variacions per a un to donat.
 * @param key  ex: "Am", "G", "F#m"
 */
export function chordsForKey(key: string): ChordsForKey {
  const isMin = key.endsWith("m") && key !== "F" && key !== "C"
  const root = isMin ? key.slice(0, -1) : key
  const normRoot = (FLAT_MAP[root] as string | undefined) ?? root
  const rootIdx = (CHROMATIC as readonly string[]).indexOf(normRoot)
  if (rootIdx === -1) return { diatonic: [], secondary: [] }

  const degrees = isMin ? SCALE_DEGREES.minor : SCALE_DEGREES.major
  const diatonic: string[] = []
  const secondary: string[] = []

  degrees.forEach(({ interval, suffixes }) => {
    const note = CHROMATIC[(rootIdx + interval) % 12]
    suffixes.forEach((suf, i) => {
      ;(i === 0 ? diatonic : secondary).push(note + suf)
    })
  })

  return { diatonic, secondary }
}
