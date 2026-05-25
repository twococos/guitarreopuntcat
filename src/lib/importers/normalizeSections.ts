/**
 * Normalitza els noms de seccions (`<sec>X</sec>`) dins el contingut importat
 * cap als tipus permesos a `SECTION_TYPES` (vegeu `src/lib/editor/sections.ts`).
 *
 * Funciona independentment de la web d'origen: opera sobre el `content` final
 * ja formatejat amb tags `<sec>` i `<ch>` que retornen els parsers.
 *
 * Cobertura: noms en català, castellà i anglès amb variants comunes. Si un nom
 * no encaixa amb cap entrada, es deixa intacte — no trenca res, l'editor el
 * mostrarà tal com està i l'admin podrà arreglar-lo manualment.
 *
 * Les estrofes s'autonumeren en ordre d'aparició via `renumberEstrofas`.
 */

import { renumberEstrofas, type SectionType } from "@/lib/editor/sections"

/**
 * Diccionari de sinònims → tipus permès.
 * Les claus es comparen normalitzades (minúscules, sense accents, sense
 * caràcters no alfanumèrics). Les regles d'aplicació estan a `matchSection`.
 */
const SYNONYMS: Record<string, SectionType> = {
  // ------------------------------ Estrofa ------------------------------
  estrofa: "Estrofa",
  estrofes: "Estrofa",
  // Castellà
  estrofa_es: "Estrofa",
  estrofas: "Estrofa",
  verso: "Estrofa",
  versos: "Estrofa",
  // Anglès
  verse: "Estrofa",
  verses: "Estrofa",

  // ------------------------------ Tornada ------------------------------
  tornada: "Tornada",
  tornades: "Tornada",
  // Castellà
  estribillo: "Tornada",
  estribillos: "Tornada",
  coro: "Tornada",
  coros: "Tornada",
  // Anglès
  chorus: "Tornada",
  refrain: "Tornada",
  refrains: "Tornada",
  hook: "Tornada",

  // ---------------------------- Pre-tornada ----------------------------
  pretornada: "Pre-tornada",
  // Castellà
  preestribillo: "Pre-tornada",
  precoro: "Pre-tornada",
  // Anglès
  prechorus: "Pre-tornada",
  prehook: "Pre-tornada",

  // -------------------------------- Pont -------------------------------
  pont: "Pont",
  // Castellà
  puente: "Pont",
  // Anglès
  bridge: "Pont",
  middle8: "Pont",

  // -------------------------------- Solo -------------------------------
  solo: "Solo",
  solos: "Solo",
  // Anglès
  guitarsolo: "Solo",
  solodeguitarra: "Solo",
  solodeguitar: "Solo",
  solodebajo: "Solo",
  basssolo: "Solo",
  solodepiano: "Solo",
  pianosolo: "Solo",

  // ---------------------------- Instrumental ---------------------------
  instrumental: "Instrumental",
  instrumentals: "Instrumental",
  // Castellà
  instrumental_es: "Instrumental",

  // ----------------------------- Interludi -----------------------------
  interludi: "Interludi",
  // Castellà
  interludio: "Interludi",
  // Anglès
  interlude: "Interludi",
  break: "Interludi",
  breakdown: "Interludi",

  // -------------------------------- Intro ------------------------------
  intro: "Intro",
  introduccio: "Intro",
  // Castellà
  introduccion: "Intro",
  // Anglès
  introduction: "Intro",

  // -------------------------------- Outro ------------------------------
  outro: "Outro",
  // Català
  final: "Outro",
  finalitzacio: "Outro",
  conclusio: "Outro",
  cloenda: "Outro",
  // Castellà
  cierre: "Outro",
  conclusion: "Outro",
  // Anglès
  ending: "Outro",
  end: "Outro",
  coda: "Outro",
  fadeout: "Outro",
  fade: "Outro",
  fadein: "Intro",
  finale: "Outro",
  tag: "Outro",
}

/** Normalitza una cadena per comparar contra el diccionari. */
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // treu marques diacrítiques
    .replace(/[^a-z0-9]/g, "") // treu espais, guions, números i puntuació
}

/**
 * Mira si un nom de secció encaixa amb algun sinònim conegut.
 * Retorna el `SectionType` corresponent o `null` si no hi ha match.
 *
 * Estratègia:
 *  1. Treu numeració al final (ex: "Verse 2" → "Verse", "Estribillo 1" → "Estribillo").
 *  2. Treu sufixos numèrics enganxats (ex: "Verse2" → "Verse").
 *  3. Normalitza i busca a `SYNONYMS`.
 */
function matchSection(name: string): SectionType | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  // Treu numeració/ordinals al final: "Verse 2", "Chorus #3", "Estrofa II",
  // "Verso 1º", "Coro nº 4", etc.
  const withoutNumber = trimmed
    .replace(/[\s#:.\-_]*(?:n[ºo°]?\.?)?\s*\d+\s*[ºªo°]?\s*$/i, "")
    .replace(/\s+[ivxlcdm]+\s*$/i, "") // numerals romans bàsics
    .trim()

  const candidate = withoutNumber || trimmed
  const key = normalizeKey(candidate)
  if (!key) return null

  if (SYNONYMS[key]) return SYNONYMS[key]

  // Provar també treient el sufix numèric enganxat sense espai ("Verse2").
  const keyNoTrailingDigits = key.replace(/\d+$/, "")
  if (keyNoTrailingDigits && SYNONYMS[keyNoTrailingDigits]) {
    return SYNONYMS[keyNoTrailingDigits]
  }

  return null
}

/**
 * Recorre el contingut, substitueix els noms de secció que tinguin match cap
 * al tipus canònic, i renumera les estrofes en ordre d'aparició.
 *
 * Els noms sense match es deixen intactes.
 */
export function normalizeSectionTitles(content: string): string {
  // 1r pas: substituir cada <sec>X</sec> pel tipus mapejat (sense numeració,
  //         excepte Estrofa que es renumera al pas 2).
  const mapped = content.replace(/<sec>([\s\S]*?)<\/sec>/g, (_match, rawName: string) => {
    const matched = matchSection(rawName)
    if (!matched) return `<sec>${rawName}</sec>`
    return `<sec>${matched}</sec>`
  })

  // 2n pas: renumerar les estrofes consecutivament.
  const names: string[] = []
  const placeholders: string[] = []
  let i = 0
  const withPlaceholders = mapped.replace(/<sec>([\s\S]*?)<\/sec>/g, (_match, name: string) => {
    names.push(name)
    const token = `\x00SEC${i}\x00`
    placeholders.push(token)
    i += 1
    return token
  })

  const renumbered = renumberEstrofas(names)

  let out = withPlaceholders
  placeholders.forEach((token, idx) => {
    out = out.replace(token, `<sec>${renumbered[idx]}</sec>`)
  })

  return out
}
