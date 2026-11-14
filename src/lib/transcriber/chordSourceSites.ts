/**
 * Llocs de tabs d'acords que el transcriptor sap llegir (DOMINIS de
 * src/transcriptor/stages/chords_source.py). Sense dependències de servidor: també el fa
 * servir el diàleg «Fonts d'acords» de l'admin.
 */

export const CHORD_SOURCE_DOMAINS: Record<string, string> = {
  "ultimate-guitar.com": "ultimate_guitar",
  "cifraclub.com": "cifraclub",
  "cifraclub.com.br": "cifraclub",
  "e-chords.com": "echords",
  "lacuerda.net": "lacuerda",
  "acordesweb.com": "acordesweb",
  "guitartuna.com": "guitartuna",
  "acordscatala.cat": "acordscatala",
}

/**
 * La URL normalitzada (sense espais ni fragment) i el lloc, si és una URL http(s) d'un dels
 * llocs coneguts. null si no ho és.
 */
export function parseChordSourceUrl(raw: string): { url: string; site: string } | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null
  const host = u.hostname.toLowerCase()
  const site = Object.entries(CHORD_SOURCE_DOMAINS).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1]
  if (!site) return null
  u.hash = ""
  return { url: u.href, site }
}
