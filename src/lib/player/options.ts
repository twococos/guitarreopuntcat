/**
 * src/lib/player/options.ts — Constants del reproductor que fa servir la UI abans de carregar el
 * controlador (que s'importa amb import() dinàmic i no pot entrar al paquet de la pàgina).
 */

import type { MixLevels } from "./engine"

export type PlayerMode = "video" | "solo"

/** Mescla de l'acompanyament (només en mode sol: en mode vídeo sona només el vídeo). */
export type Mix = MixLevels

export const DEFAULT_MIX: Mix = { guitar: 0.9, bass: 0.6, perc: 0.5, click: 0 }

/** Velocitat lliure entre aquests límits, als dos modes (YouTube accepta valors intermedis). */
export const RATE_RANGE = { min: 0.5, max: 1.25, step: 0.05 }
