/**
 * src/lib/editor/chordFunctions.ts
 *
 * Helper per agrupar els acords del to en funcions tonals (Tònica / Subdominant / Dominant)
 * + acords cromàtics fora del to + modificadors disponibles.
 */

import { CHROMATIC } from "../transpose"

export interface ChordsByFunction {
  tonic: string[] // graus I i vi en major; i i III en menor
  subdominant: string[] // graus IV i ii en major; iv i VI en menor
  dominant: string[] // graus V, iii i vii° en major; v, VII i ii° en menor
  chromatic: string[] // tots els acords cromàtics fora del to (majors i menors)
}

export const CHORD_MODIFIERS = [
  "maj7",
  "7",
  "m7",
  "sus2",
  "sus4",
  "add9",
  "6",
  "dim",
  "m7b5",
  "mmaj7",
  "9",
  "13",
  "aug",
] as const

export type ChordModifier = (typeof CHORD_MODIFIERS)[number]

/**
 * Intervals tonals en semitons des de la tònica.
 *
 * Major: I=0, ii=2(m), iii=4(m), IV=5, V=7, vi=9(m), vii°=11(dim)
 * Menor: i=0(m), ii°=2(dim), III=3, iv=5(m), V=7(major), VI=8, VII=10
 */
interface DegreeInfo {
  interval: number // semitons des de la tònica
  isMajor: boolean // si la qualitat és major (sense m)
}

const MAJOR_DEGREES: Record<string, DegreeInfo> = {
  I: { interval: 0, isMajor: true }, // Tònica
  ii: { interval: 2, isMajor: false }, // Subdominant
  iii: { interval: 4, isMajor: false }, // Dominant
  IV: { interval: 5, isMajor: true }, // Subdominant
  V: { interval: 7, isMajor: true }, // Dominant
  vi: { interval: 9, isMajor: false }, // Tònica
  "vii°": { interval: 11, isMajor: false }, // Dominant (diminuït)
}

const MINOR_DEGREES: Record<string, DegreeInfo> = {
  i: { interval: 0, isMajor: false }, // Tònica
  "ii°": { interval: 2, isMajor: false }, // Subdominant (diminuït)
  III: { interval: 3, isMajor: true }, // Tònica
  iv: { interval: 5, isMajor: false }, // Subdominant
  V: { interval: 7, isMajor: true }, // Dominant (major harmònica)
  VI: { interval: 8, isMajor: true }, // Subdominant
  VII: { interval: 10, isMajor: true }, // Dominant
}

/**
 * Obtenir la nota a partir de l'índex a CHROMATIC.
 */
function getNoteAtInterval(
  rootIdx: number,
  interval: number,
): (typeof CHROMATIC)[number] {
  const idx = (rootIdx + interval) % 12
  return CHROMATIC[idx]
}

/**
 * Construir un acord a partir de la nota base i la qualitat.
 * Ex: ("C", true) → "C", ("C", false) → "Cm"
 */
function buildChord(note: string, isMajor: boolean): string {
  return isMajor ? note : `${note}m`
}

/**
 * Format especial per als diminuïts.
 * Ex: nota "B", diminuït → "Bdim"
 */
function buildDiminishedChord(note: string): string {
  return `${note}dim`
}

/**
 * Donada una tonalitat (Ex: "C", "Am", "F#m"), retorna els acords agrupats per
 * funció tonal.
 *
 * La tonalitat és menor si acaba amb "m" (ex: "Am", "F#m").
 * Si no acaba amb "m", és major (ex: "C", "F#", "G").
 *
 * Les funcions tonals es defineixen per graus de l'escala:
 *
 * Major (ex: C major):
 *   tonic: [C, Am]                  (I, vi)
 *   subdominant: [F, Dm]            (IV, ii)
 *   dominant: [G, Em, Bdim]         (V, iii, vii°)
 *
 * Menor (ex: Am menor):
 *   tonic: [Am, C]                  (i, III)
 *   subdominant: [Dm, F]            (iv, VI)
 *   dominant: [E, G, Bdim]          (V, VII, ii°)
 *
 * chromatic: resta dels acords cromàtics en ordre: primers els majors, després els menors
 *            que no són al to.
 */
export function chordsByFunction(key: string): ChordsByFunction {
  // Detectar si és menor
  const isMinor = key.endsWith("m") && key.length > 1
  const rootStr = isMinor ? key.slice(0, -1) : key

  // Trobar l'índex de la tònica a CHROMATIC
  const rootIdx = (CHROMATIC as readonly string[]).indexOf(
    rootStr as (typeof CHROMATIC)[number],
  )
  if (rootIdx === -1) {
    // Tonalitat no vàlida
    return { tonic: [], subdominant: [], dominant: [], chromatic: [] }
  }

  // Seleccionar els graus segons tonalitat
  const degrees = isMinor ? MINOR_DEGREES : MAJOR_DEGREES

  // Agrupar per funció
  const tonic: string[] = []
  const subdominant: string[] = []
  const dominant: string[] = []

  // Ordre de processament: primer els primaris (I/IV/V), després els
  // relatius (vi/ii/iii), després els terciaris (vii°). Així cada array
  // (tonic/subdominant/dominant) queda ordenat amb el primari al davant,
  // i el menú mostra la graella esperada:
  //   Fila 1: I    IV   V       (primaris)
  //   Fila 2: vi   ii   iii     (relatius)
  //   Fila 3: -    -    vii°    (terciari)
  const majorOrder = ["I", "IV", "V", "vi", "ii", "iii", "vii°"]
  // Equivalent funcional en menor:
  //   Fila 1: i    iv   V
  //   Fila 2: III  VI   VII
  //   Fila 3: -    -    ii°
  const minorOrder = ["i", "iv", "V", "III", "VI", "VII", "ii°"]

  const degreeOrder = isMinor ? minorOrder : majorOrder

  for (const degreeLabel of degreeOrder) {
    const degreeInfo = degrees[degreeLabel]
    if (!degreeInfo) continue

    const note = getNoteAtInterval(rootIdx, degreeInfo.interval)

    // Construir l'acord
    let chord: string
    if (degreeLabel.includes("°")) {
      // Diminuït
      chord = buildDiminishedChord(note)
    } else {
      chord = buildChord(note, degreeInfo.isMajor)
    }

    // Classificar per funció
    // Major: I, vi → tònica; IV, ii → subdominant; V, iii, vii° → dominant
    // Menor: i, III → tònica; iv, VI → subdominant; V, VII, ii° → dominant
    if (isMinor) {
      if (["i", "III"].includes(degreeLabel)) {
        tonic.push(chord)
      } else if (["iv", "VI"].includes(degreeLabel)) {
        subdominant.push(chord)
      } else if (["V", "VII", "ii°"].includes(degreeLabel)) {
        dominant.push(chord)
      }
    } else {
      if (["I", "vi"].includes(degreeLabel)) {
        tonic.push(chord)
      } else if (["IV", "ii"].includes(degreeLabel)) {
        subdominant.push(chord)
      } else if (["V", "iii", "vii°"].includes(degreeLabel)) {
        dominant.push(chord)
      }
    }
  }

  // Generar acords cromàtics (fora del to)
  // Recollir tots els acords del to
  const achordsInKey = new Set([...tonic, ...subdominant, ...dominant])

  const chromatic: string[] = []

  // Primer, tots els majors cromàtics
  for (const note of CHROMATIC) {
    if (!achordsInKey.has(note)) {
      chromatic.push(note)
    }
  }

  // Després, tots els menors cromàtics
  for (const note of CHROMATIC) {
    const minorChord = `${note}m`
    if (!achordsInKey.has(minorChord)) {
      chromatic.push(minorChord)
    }
  }

  return {
    tonic,
    subdominant,
    dominant,
    chromatic,
  }
}

/**
 * Aplica un modificador a un acord. Si l'acord ja té un modificador, el reemplaça.
 *
 * Lògica:
 * 1. Detecta la base de l'acord: nota arrel (1-2 caràcters: lletra + opcional # o b).
 * 2. La resta és la qualitat actual.
 * 3. Si la qualitat conté "m" (és menor) i el modificador no comença per "m",
 *    es manté la "m" i s'afegeix el modificador a continuació.
 *    Casos especials per a "maj" i "mmaj".
 *
 * Exemples:
 *   "C" + "maj7" → "Cmaj7"
 *   "Am" + "7" → "Am7"
 *   "Am" + "maj7" → "Ammaj7"
 *   "C" + "m7" → "Cm7"
 *   "Cmaj7" + "sus2" → "Csus2"
 *   "Am7" + "sus4" → "Amsus4"
 */
export function applyModifier(chord: string, modifier: string): string {
  if (!chord) return ""

  // Detectar la base: primers 1-2 caràcters (nota + opcional # o b)
  let base = ""
  let baseEnd = 1
  if (chord.length >= 2 && (chord[1] === "#" || chord[1] === "b")) {
    base = chord.slice(0, 2)
    baseEnd = 2
  } else {
    base = chord[0]
  }

  // Qualitat actual
  const currentQuality = chord.slice(baseEnd)

  // Detectar si és menor (comença amb "m" si no és "maj")
  const isMinor = currentQuality.startsWith("m") && !currentQuality.startsWith("maj")

  // Detectar si el modificador comença amb "m"
  const modifierIsMinor = modifier.startsWith("m")

  let newQuality = ""

  if (isMinor && !modifierIsMinor && !modifier.startsWith("maj")) {
    // Mantenir la "m"
    newQuality = `m${modifier}`
  } else {
    // Reemplaçar totalment la qualitat
    newQuality = modifier
  }

  return base + newQuality
}

/**
 * Treu el modificador de l'acord deixant només la base (i la m si és menor).
 *
 * Exemples:
 *   "Cmaj7" → "C"
 *   "Am7" → "Am"
 *   "F#sus4" → "F#"
 *   "C" → "C"
 *   "Dm" → "Dm"
 */
export function stripModifier(chord: string): string {
  if (!chord) return ""

  // Detectar la base
  let baseEnd = 1
  if (chord.length >= 2 && (chord[1] === "#" || chord[1] === "b")) {
    baseEnd = 2
  }

  const base = chord.slice(0, baseEnd)
  const rest = chord.slice(baseEnd)

  // Si rest és exactament "m", és menor sense modificador
  if (rest === "m") {
    return base + "m"
  }

  // Si rest comença amb "m" però NO amb "ma" o "maj" (évita "maj7", "mmaj7", etc.)
  // i el caràcter següent no és una lletra (és un número o fi)
  if (rest.length > 1 && rest[0] === "m" && rest[1] !== "a") {
    return base + "m"
  }

  // Si rest comença amb "ma" o "maj" (Ex: "maj7"), és major sense "m"
  // Si rest és altra cosa (Ex: "7", "sus4", "dim", etc.), és major
  return base
}
