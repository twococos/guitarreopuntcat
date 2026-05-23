/**
 * Registre central d'importadors — versió **server-only**.
 *
 * Importa els mòduls concrets dels parsers (que poden arrossegar dependències
 * server-only com `puppeteerFetch`). Cap client component pot tocar aquest
 * fitxer: el client només necessita els hosts suportats (vegeu `./index.ts`).
 */

import "server-only"
import type { Importer } from "./types"
import { acordsCatala } from "./acordscatala"
import { cifraClub } from "./cifraclub"
import { ultimateGuitar } from "./ultimateGuitar"
import { guitarTuna } from "./guitartuna"

const IMPORTERS: Importer[] = [acordsCatala, cifraClub, ultimateGuitar, guitarTuna]

/** Retorna l'importador adequat per a una URL, o null si no n'hi ha cap. */
export function findImporter(rawUrl: string): Importer | null {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return IMPORTERS.find((i) => i.match(u)) ?? null
  } catch {
    return null
  }
}
