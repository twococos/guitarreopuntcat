/**
 * API client-safe d'importadors de cançons.
 *
 * Exposa la informació mínima necessària per al **client** (popup
 * `NewSongStartPopup`): llista de hosts suportats i comprovació ràpida si una
 * URL n'és una. La crida real (fetch + parse) la fa la Route Handler
 * `POST /api/songs/import` via `./registry.server.ts`.
 *
 * Per afegir suport a una nova web:
 *   1. Crear `./novaweb.ts` que exporta un `Importer`.
 *   2. Afegir-lo a `IMPORTERS` dins `./registry.server.ts`.
 *   3. Afegir el seu host (o hosts) a `SUPPORTED_HOSTS` aquí baix.
 */

/** Hosts (i àlies) suportats. Llista estàtica per al client. */
export const SUPPORTED_HOSTS: readonly string[] = [
  "www.acordscatala.cat",
  "acordscatala.cat",
  "www.cifraclub.com",
  "cifraclub.com",
  "m.cifraclub.com",
  "tabs.ultimate-guitar.com",
  "www.ultimate-guitar.com",
  "ultimate-guitar.com",
  "guitartuna.com",
  "www.guitartuna.com",
]

/**
 * UG redirigeix els visitants a un host regional segons la IP (es., de., fr.,
 * pt., it., ja., ko., zh., ru.…). Tots aquests subdominis serveixen el
 * mateix contingut amb només la UI traduïda — el parser funciona igualment.
 * Per evitar haver d'enumerar tots els codis ISO, acceptem qualsevol
 * subdomini de `ultimate-guitar.com`.
 */
function isUltimateGuitarHost(host: string): boolean {
  return host === "ultimate-guitar.com" || host.endsWith(".ultimate-guitar.com")
}

/** Comprovació ràpida (client-safe) — només mira host i protocol. */
export function isSupportedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    if (SUPPORTED_HOSTS.includes(host)) return true
    return isUltimateGuitarHost(host)
  } catch {
    return false
  }
}

export type { Importer, ImportResult } from "./types"
