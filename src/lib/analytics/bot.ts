/**
 * Detecció de bots i crawlers a partir de la cadena User-Agent.
 * Fa servir la llibreria `isbot` com a motor principal,
 * complementada amb heurístiques bàsiques.
 */

import { isbot } from "isbot"

export type BotResult = {
  /** Indica si la petició s'ha identificat com a bot/crawler. */
  isBot: boolean
  /**
   * Origen de la detecció:
   * - "isbot"     → detectat per la llibreria isbot
   * - "heuristic" → detectat per heurística pròpia (UA absent o massa curt)
   * - null        → no és bot
   */
  kind: "isbot" | "heuristic" | null
}

/**
 * Determina si una cadena User-Agent pertany a un bot o crawler.
 * Mai tira.
 */
export function detectBot(ua: string | null | undefined): BotResult {
  // UA absent, buit o sospitosament curt -> tractarem com a bot per heurística
  if (!ua || ua.length < 10) {
    return { isBot: true, kind: "heuristic" }
  }

  if (isbot(ua)) {
    return { isBot: true, kind: "isbot" }
  }

  return { isBot: false, kind: null }
}
