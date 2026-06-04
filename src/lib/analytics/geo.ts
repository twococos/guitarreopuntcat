/**
 * Lookup de país per IP usant la base de dades GeoLite2-Country de MaxMind.
 *
 * La BD es carrega de forma lazy però SÍNCRONAMENT al primer ús
 * (fs.readFileSync + Reader.openBuffer), evitant així race conditions
 * típiques amb Promise dins el lazy-loading de mòduls de Next.js dev.
 */

import path from "path"
import fs from "fs"
import { Reader, ReaderModel } from "@maxmind/geoip2-node"

// Ruta a la BD .mmdb; configurable via variable d'entorn
const DB_PATH =
  process.env.ANALYTICS_GEOIP_DB_PATH ??
  path.join(process.cwd(), "data", "GeoLite2-Country.mmdb")

// Mida màxima del cache LRU senzill (FIFO)
const CACHE_MAX = 1024

// Estat del singleton (per evitar duplicats en hot-reload de Next dev)
declare global {
  // eslint-disable-next-line no-var
  var __analyticsGeoReader:
    | { reader: ReaderModel | null; unavailable: boolean }
    | undefined
}

// Cache IP -> codi ISO2 (o null)
const cache = new Map<string, string | null>()

/**
 * Carrega el Reader síncronament la primera vegada. Si la BD no existeix,
 * marca `unavailable` per a saltar futures temptatives.
 */
function ensureReader(): { reader: ReaderModel | null; unavailable: boolean } {
  const state = globalThis.__analyticsGeoReader
  if (state) return state

  try {
    const buffer = fs.readFileSync(DB_PATH)
    const reader = Reader.openBuffer(buffer)
    const next = { reader, unavailable: false }
    globalThis.__analyticsGeoReader = next
    return next
  } catch (err: unknown) {
    const isEnoent =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"

    if (isEnoent) {
      console.warn(
        `BD GeoIP no trobada a ${DB_PATH}; el camp country quedarà null`,
      )
    } else {
      console.warn(`Error en obrir la BD GeoIP (${DB_PATH}):`, err)
    }
    const next = { reader: null, unavailable: true }
    globalThis.__analyticsGeoReader = next
    return next
  }
}

/**
 * Retorna el codi de país ISO 3166-1 alpha-2 per a la IP donada,
 * o `null` si la BD no està disponible o la IP no té registre.
 *
 * Mai tira. Resultat cachejat (màx. 1024 entrades FIFO).
 */
export function lookupCountry(ip: string): string | null {
  const { reader, unavailable } = ensureReader()
  if (unavailable || reader === null) return null

  if (cache.has(ip)) {
    return cache.get(ip) ?? null
  }

  let result: string | null = null
  try {
    result = reader.country(ip).country?.isoCode ?? null
  } catch {
    // IP invàlida, loopback, etc. — retorna null silenciosament
    result = null
  }

  // Evicció FIFO quan s'arriba al límit
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(ip, result)

  return result
}
