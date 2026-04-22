/**
 * shared/transpose.js — Motor de transposició compartit
 * Funciona tant a Node.js (require) com al navegador (<script src>).
 *
 * Format de les cançons: acords marcats amb <ch>X</ch>, seccions amb <sec>X</sec>.
 */

;(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory() // Node.js
  } else {
    root.Transpose = factory() // Navegador → window.Transpose
  }
})(typeof self !== "undefined" ? self : this, function () {
  const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const FLAT_MAP = { Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B" }

  // Tots els tons disponibles (per als selectors)
  const ALL_KEYS = [
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
  ]

  // Graus de l'escala per generar acords del to (en semitons des de la tònica)
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
  }

  /* ── Funcions bàsiques ───────────────────────────────────── */

  /** Transposa una nota individual N semitons. */
  function transposeNote(note, semitones) {
    const norm = FLAT_MAP[note] || note
    const idx = CHROMATIC.indexOf(norm)
    if (idx === -1) return note
    return CHROMATIC[(idx + semitones + 12) % 12]
  }

  /** Transposa un acord complet (inclou baix si té "/X"). */
  function transposeChord(chord, semitones) {
    return chord.replace(/[A-G][b#]?/g, (n) => transposeNote(n, semitones))
  }

  /** Transposa el to d'una cançó (camp `key`). */
  function transposeKey(key, semitones) {
    if (semitones === 0) return key
    return key.replace(/[A-G][b#]?/g, (n) => transposeNote(n, semitones))
  }

  /**
   * Transposa tot el contingut d'una cançó.
   * Reconeix acords dins de <ch>...</ch>.
   */
  function transposeContent(content, semitones) {
    if (semitones === 0) return content
    return content.replace(
      /(<ch>)([^<]+)(<\/ch>)/g,
      (_, open, chord, close) => `${open}${transposeChord(chord.trim(), semitones)}${close}`,
    )
  }

  /* ── Generació d'acords per to ───────────────────────────── */

  /**
   * Retorna els acords diatònics i variacions per a un to donat.
   * @param {string} key  ex: "Am", "G", "F#m"
   * @returns {{ diatonic: string[], secondary: string[] }}
   */
  function chordsForKey(key) {
    const isMin = key.endsWith("m") && key !== "F" && key !== "C"
    const root = isMin ? key.slice(0, -1) : key
    const rootIdx = CHROMATIC.indexOf(FLAT_MAP[root] || root)
    if (rootIdx === -1) return { diatonic: [], secondary: [] }

    const degrees = isMin ? SCALE_DEGREES.minor : SCALE_DEGREES.major
    const diatonic = [],
      secondary = []

    degrees.forEach(({ interval, suffixes }) => {
      const note = CHROMATIC[(rootIdx + interval) % 12]
      suffixes.forEach((suf, i) => {
        ;(i === 0 ? diatonic : secondary).push(note + suf)
      })
    })

    return { diatonic, secondary }
  }

  /* ── API pública ─────────────────────────────────────────── */
  return {
    CHROMATIC,
    ALL_KEYS,
    transposeNote,
    transposeChord,
    transposeKey,
    transposeContent,
    chordsForKey,
  }
})
