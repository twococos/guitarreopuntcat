/**
 * Parsing de la capçalera User-Agent per extreure navegador, SO i tipus de dispositiu.
 * Fa servir ua-parser-js com a motor de parsing.
 */

import { UAParser } from "ua-parser-js"

// Mida màxima del cache LRU senzill (FIFO)
const CACHE_MAX = 500

export type ParsedUA = {
  /** Nom del navegador, p. ex. "Chrome", "Safari". Null si no es pot determinar. */
  browser: string | null
  /** Nom del sistema operatiu, p. ex. "Windows", "iOS". Null si no es pot determinar. */
  os: string | null
  /** Categoria de dispositiu. Null si ua era buit/invàlid. */
  device: "desktop" | "mobile" | "tablet" | "bot" | null
}

// Cache UA string -> ParsedUA
const cache = new Map<string, ParsedUA>()

/**
 * Mapeja el camp `type` de ua-parser-js a les categories del projecte.
 * El valor "bot" no s'assigna aquí; es decideix al middleware via detectBot().
 */
function mapDeviceType(
  type: string | undefined,
): "desktop" | "mobile" | "tablet" {
  switch (type) {
    case "mobile":
      return "mobile"
    case "tablet":
      return "tablet"
    case "smarttv":
    case "console":
    case "wearable":
      // Dispositius no-desktop sense categoria pròpia -> mobile genèric
      return "mobile"
    default:
      // undefined (escriptori) i qualsevol valor desconegut -> desktop
      return "desktop"
  }
}

/**
 * Analitza una cadena User-Agent i retorna navegador, SO i tipus de dispositiu.
 * Mai tira. Resultat cachejat (màx. 500 entrades FIFO).
 */
export function parseUA(ua: string | null | undefined): ParsedUA {
  if (!ua || ua.trim().length === 0) {
    return { browser: null, os: null, device: null }
  }

  // Consulta el cache primer
  if (cache.has(ua)) {
    return cache.get(ua) as ParsedUA
  }

  const parser = new UAParser(ua)

  const browser = parser.getBrowser().name ?? null
  const os = parser.getOS().name ?? null
  const device = mapDeviceType(parser.getDevice().type)

  const parsed: ParsedUA = { browser, os, device }

  // Evicció FIFO quan s'arriba al límit
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(ua, parsed)

  return parsed
}
