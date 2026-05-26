/**
 * Tipus comuns per als importadors de cançons des d'URLs externes.
 *
 * Cada web suportada (acordscatala, etc.) implementa la interfície `Importer`
 * i es registra a `./index.ts`.
 */

export interface ImportResult {
  title: string
  artist: string
  /** Tonalitat dins ALL_KEYS (src/lib/transpose.ts). Si no es pot detectar → "Am". */
  key: string
  capo: number
  /** "ca" | "es" | "en" | "other" */
  language: string
  /** Etiquetes separades per comes. Pot ser string buit. */
  tags: string
  /** Contingut ja amb tags <sec> i <ch> aplicats. */
  content: string
  /** Àlbum si es detecta. */
  album?: string
  /** Any de publicació (4 dígits). */
  year?: number
  /** URL a un vídeo de YouTube de la cançó si es detecta. */
  youtubeUrl?: string
  /** URL a un track/episode de Spotify si es detecta. */
  spotifyUrl?: string
}

export interface Importer {
  /** Identificador (per logs i errors). Ex: "www.acordscatala.cat" */
  host: string
  /** Determina si aquest importador pot gestionar una URL donada. */
  match: (url: URL) => boolean
  /**
   * Descarrega l'HTML de la pàgina. Implementació per defecte:
   * fetch nadiu amb User-Agent realista i timeout. Es pot custom per pàgina.
   */
  fetch: (url: string) => Promise<string>
  /** Analitza l'HTML i retorna les dades llestes per a l'editor. */
  parse: (html: string, url: string) => ImportResult
}
