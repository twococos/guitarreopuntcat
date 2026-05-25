/**
 * src/lib/editor/sections.ts
 *
 * Constants i helpers per gestionar les seccions permeses de la cançó.
 */

export const SECTION_TYPES = [
  "Estrofa",
  "Tornada",
  "Pre-tornada",
  "Pont",
  "Solo",
  "Instrumental",
  "Interludi",
  "Intro",
  "Outro",
] as const

export type SectionType = (typeof SECTION_TYPES)[number]

/**
 * Retorna el tipus base d'una secció a partir del seu nom complet.
 * Ex: "Estrofa 3" → "Estrofa", "Tornada" → "Tornada".
 * Si el nom no encaixa amb cap tipus permès, retorna null.
 */
export function getSectionType(name: string): SectionType | null {
  const trimmed = name.trim()

  // Primer, provar match exacte per tipus sense numeració
  if (SECTION_TYPES.includes(trimmed as SectionType)) {
    return trimmed as SectionType
  }

  // Si no, provar match amb numeració: "Estrofa 1", "Estrofa 2", etc.
  for (const type of SECTION_TYPES) {
    // Match "NomTipus N" on N és un nombre
    const regex = new RegExp(`^${type}\\s+(\\d+)$`)
    if (regex.test(trimmed)) {
      return type
    }
  }

  return null
}

/**
 * Donada una llista de noms de seccions ja existents al document i un tipus
 * a inserir, retorna el nom que ha de tenir la nova secció.
 *
 * - Si el tipus és "Estrofa": "Estrofa N" amb N = (count d'estrofes existents) + 1.
 *   Compta com a "estrofa existent" qualsevol nom on getSectionType retorni "Estrofa".
 * - Altres tipus: retorna el tipus literal sense numeració.
 */
export function nextSectionName(
  existingNames: string[],
  type: SectionType,
): string {
  if (type === "Estrofa") {
    // Comptar estrofes existents
    const estrofaCount = existingNames.filter(
      (name) => getSectionType(name) === "Estrofa",
    ).length
    return `Estrofa ${estrofaCount + 1}`
  }

  return type
}

/**
 * Renumera totes les estrofes d'una llista de noms en ordre d'aparició.
 * Retorna una nova llista amb les estrofes renumerades 1..N i la resta intactes.
 *
 * Ex: ["Intro", "Estrofa 5", "Tornada", "Estrofa 2"]
 *   → ["Intro", "Estrofa 1", "Tornada", "Estrofa 2"]
 */
export function renumberEstrofas(names: string[]): string[] {
  let estrofaCount = 0

  return names.map((name) => {
    if (getSectionType(name) === "Estrofa") {
      estrofaCount += 1
      return `Estrofa ${estrofaCount}`
    }
    return name
  })
}
