/**
 * Registre de les fonts pròpies (public/fonts/).
 *
 * ESPILL dels @font-face de src/styles/song.css: el navegador maqueta
 * amb aquests fitxers i l'escriptor de PDF incrusta exactament els
 * mateixos, de manera que mètriques i aparença coincideixen. Si afegeixes
 * o treus una cara aquí, fes-ho també a song.css (i viceversa).
 */

export type FontStyle = "normal" | "italic"

export interface FontFaceDef {
  family: string
  weight: number
  style: FontStyle
  /** URL pública del TTF. */
  url: string
}

function face(family: string, weight: number, style: FontStyle, file: string): FontFaceDef {
  return { family, weight, style, url: `/fonts/${file}` }
}

export const FONT_FACES: readonly FontFaceDef[] = [
  face("Gelasio", 400, "normal", "Gelasio-400.ttf"),
  face("Gelasio", 700, "normal", "Gelasio-700.ttf"),
  face("Gelasio", 400, "italic", "Gelasio-400i.ttf"),
  face("Gelasio", 700, "italic", "Gelasio-700i.ttf"),
  face("Caladea", 400, "normal", "Caladea-400.ttf"),
  face("Caladea", 700, "normal", "Caladea-700.ttf"),
  face("Cousine", 400, "normal", "Cousine-400.ttf"),
  face("Cousine", 700, "normal", "Cousine-700.ttf"),
  face("Inconsolata", 400, "normal", "Inconsolata-400.ttf"),
  face("Inconsolata", 700, "normal", "Inconsolata-700.ttf"),
  face("Anton", 400, "normal", "Anton-400.ttf"),
  face("Inter", 400, "normal", "Inter-400.ttf"),
  face("Inter", 600, "normal", "Inter-600.ttf"),
  face("Inter", 700, "normal", "Inter-700.ttf"),
  face("JetBrains Mono", 400, "normal", "JetBrainsMono-400.ttf"),
  face("JetBrains Mono", 700, "normal", "JetBrainsMono-700.ttf"),
  face("Caveat", 400, "normal", "Caveat-400.ttf"),
  face("Caveat", 700, "normal", "Caveat-700.ttf"),
]

/** Família de reserva si cap de la pila CSS és nostra. */
const FALLBACK_FAMILY = "Gelasio"

/** Separa una pila `font-family` computada en noms nets. */
function parseFamilyList(list: string): string[] {
  return list
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean)
}

/**
 * Tria el pes segons l'algorisme de coincidència de CSS Fonts §5.2:
 *   · desitjat > 500 → pesos ≥ desitjat ascendent, després < descendent
 *   · desitjat < 400 → pesos ≤ desitjat descendent, després > ascendent
 *   · 400..500       → [desitjat, 500] ascendent, < descendent, > 500 ascendent
 * Així triem la mateixa cara que el navegador (amb `font-synthesis: none`).
 */
function pickWeight(available: number[], desired: number): number {
  const asc = [...available].sort((a, b) => a - b)
  const desc = [...asc].reverse()
  let order: number[]
  if (desired > 500) {
    order = [...asc.filter((w) => w >= desired), ...desc.filter((w) => w < desired)]
  } else if (desired < 400) {
    order = [...desc.filter((w) => w <= desired), ...asc.filter((w) => w > desired)]
  } else {
    order = [
      ...asc.filter((w) => w >= desired && w <= 500),
      ...desc.filter((w) => w < desired),
      ...asc.filter((w) => w > 500),
    ]
  }
  return order[0]
}

/** Resol la cara concreta que el navegador fa servir per a un estil computat. */
export function matchFontFace(familyList: string, weight: number, style: string): FontFaceDef {
  const names = parseFamilyList(familyList)
  let family = names.find((n) => FONT_FACES.some((f) => f.family.toLowerCase() === n))
  if (!family) family = FALLBACK_FAMILY.toLowerCase()

  const ofFamily = FONT_FACES.filter((f) => f.family.toLowerCase() === family)
  const wantItalic = style === "italic" || style.startsWith("oblique")
  const italics = ofFamily.filter((f) => f.style === "italic")
  const pool = wantItalic && italics.length > 0 ? italics : ofFamily.filter((f) => f.style === "normal")
  const w = pickWeight(
    pool.map((f) => f.weight),
    weight,
  )
  return pool.find((f) => f.weight === w) ?? pool[0]
}
