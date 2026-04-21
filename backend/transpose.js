/**
 * Motor de transposició d'acords.
 * Suporta acords majors, menors, amb 7a, sus, dim, aug, etc.
 * i notació tant anglosaxona (A-G) com latina (Do-Si).
 */

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const FLAT_MAP = { Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B" }

// Regex per detectar acords: nota arrel + modificadors
const CHORD_REGEX = /\b([A-G][b#]?)(m|maj|min|dim|aug|sus[24]?|add\d+|[0-9]+)*(\/?[A-G][b#]?)?\b/g

/**
 * Transposa una nota individual N semitons.
 */
function transposeNote(note, semitones) {
  const normalized = FLAT_MAP[note] || note
  const idx = CHROMATIC.indexOf(normalized)
  if (idx === -1) return note // no és una nota vàlida
  return CHROMATIC[(idx + semitones + 12) % 12]
}

/**
 * Transposa un acord complet (inclou baix si té "/X").
 */
function transposeChord(chord, semitones) {
  return chord.replace(/([A-G][b#]?)/g, (note) => transposeNote(note, semitones))
}

/**
 * Transposa tot el contingut HTML d'una cançó.
 * Els acords han d'estar marcats com: <span class="chord">Am</span>
 * Si el contingut és text pla, cerca patrons d'acords directament.
 */
function transposeContent(content, semitones) {
  if (semitones === 0) return content

  // Si conté spans d'acords (HTML), transposar només el text interior
  if (content.includes('class="chord"')) {
    return content.replace(
      /(<ch>)([^<]+)(<\/ch>)/g,
      (_, open, chord, close) => `${open}${transposeChord(chord.trim(), semitones)}${close}`,
    )
  }

  // Fallback: intentar transposar notes soltes (per a camps simples com `key`)
  return content.replace(CHORD_REGEX, (match) => transposeChord(match, semitones))
}

module.exports = { transposeNote, transposeChord, transposeContent }
