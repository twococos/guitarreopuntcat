/**
 * Neteges generals del contingut importat (independents de la web d'origen).
 *
 * S'aplica al `content` final ja amb tags `<sec>` i `<ch>`, com a últim pas
 * abans de retornar el resultat al client.
 *
 * Operacions:
 *  1. Col·lapsa línies en blanc: múltiples línies buides consecutives → cap.
 *  2. En línies que NOMÉS contenen acords (sense lletra entre mig), garanteix
 *     un mínim de 4 espais entre acord i acord per a llegibilitat al render.
 */

/** Treu totes les línies en blanc (i les del principi/final). */
export function collapseBlankLines(content: string): string {
  const lines = content.split("\n")
  return lines.filter((line) => line.trim() !== "").join("\n")
}

/**
 * Detecta si una línia és "només acords": conté un o més `<ch>X</ch>` i la
 * resta són només espais en blanc.
 */
function isChordOnlyLine(line: string): boolean {
  if (!line.includes("<ch>")) return false
  const withoutChords = line.replace(/<ch>[^<]*<\/ch>/g, "")
  return withoutChords.trim() === ""
}

/**
 * En una línia només-acords, assegura mínim `minSpaces` espais entre acords
 * consecutius. Si ja n'hi ha més, els preserva.
 */
function padChordSpacing(line: string, minSpaces: number): string {
  const pad = " ".repeat(minSpaces)
  // Capturem (espais entre dos acords adjacents). Si són menys de `minSpaces`,
  // els ampliem; si són més, els deixem tal com estan.
  return line.replace(
    /(<\/ch>)( *)(?=<ch>)/g,
    (_match, close: string, gap: string) => {
      if (gap.length >= minSpaces) return close + gap
      return close + pad
    },
  )
}

/**
 * Aplica `padChordSpacing` a totes les línies només-acords del contingut.
 */
export function ensureChordSpacing(content: string, minSpaces = 4): string {
  return content
    .split("\n")
    .map((line) => (isChordOnlyLine(line) ? padChordSpacing(line, minSpaces) : line))
    .join("\n")
}

/** Pipeline complet de neteja. */
export function cleanupContent(content: string): string {
  let out = content
  out = collapseBlankLines(out)
  out = ensureChordSpacing(out, 4)
  return out
}
