/**
 * Enllaços de Spotify i neteja de títols. Pur: el fan servir el servidor i la
 * barra de la pestanya «Importar cançons».
 */

export type SpotifyKind = "track" | "playlist" | "album" | "artist"

export interface SpotifyRef {
  kind: SpotifyKind
  id: string
}

/** Una cançó tal com la fa servir la importació (snake_case: viatja en JSON). */
export interface SpotifyTrack {
  spotify_id: string
  url: string
  title: string
  artists: string[]
  album: string | null
  year: number | null
  duration_ms: number
  image_url: string | null
}

const KINDS: SpotifyKind[] = ["track", "playlist", "album", "artist"]
const ID_RE = /^[A-Za-z0-9]{22}$/

/**
 * `open.spotify.com/(intl-xx/)(embed/){kind}/{id}` o `spotify:{kind}:{id}`.
 * Els enllaços curts (`spotify.link/…`) no es poden resoldre aquí: vegeu `isSpotifyShortLink`.
 */
export function parseSpotifyRef(input: string): SpotifyRef | null {
  const text = input.trim()
  const uri = /^spotify:(track|playlist|album|artist):([A-Za-z0-9]{22})$/.exec(text)
  if (uri) return { kind: uri[1] as SpotifyKind, id: uri[2] }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.hostname !== "open.spotify.com" && url.hostname !== "play.spotify.com") return null
  const parts = url.pathname.split("/").filter(Boolean)
  for (let i = 0; i < parts.length - 1; i++) {
    const kind = parts[i] as SpotifyKind
    if (KINDS.includes(kind) && ID_RE.test(parts[i + 1])) return { kind, id: parts[i + 1] }
  }
  return null
}

export function isSpotifyShortLink(input: string): boolean {
  try {
    const host = new URL(input.trim()).hostname
    return host === "spotify.link" || host === "spotify.app.link"
  } catch {
    return false
  }
}

/** El text sembla un enllaç de Spotify (encara que sigui curt): la barra no l'ha de cercar com a text. */
export function looksLikeSpotifyLink(input: string): boolean {
  return parseSpotifyRef(input) !== null || isSpotifyShortLink(input)
}

export function spotifyUrl(kind: SpotifyKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`
}

/** Any de `release_date` ("YYYY-MM-DD", "YYYY-MM" o "YYYY" segons la precisió). */
export function releaseYear(releaseDate: string | null | undefined): number | null {
  const m = releaseDate ? /^(\d{4})/.exec(releaseDate) : null
  if (!m) return null
  const y = parseInt(m[1], 10)
  return y >= 1000 && y <= 2100 ? y : null
}

// Afegits de Spotify que no canvien la versió: es treuen del títol.
// «Live», «Acoustic», «Remix»… es deixen: són una altra versió de la cançó.
const NOISE =
  "(?:\\d{4}\\s+)?(?:digital(?:ly)?\\s+)?remaster(?:ed)?(?:\\s+(?:version|\\d{4}))?(?:\\s+\\d{4})?" +
  "|(?:single|album|radio|original)\\s+(?:version|edit|mix)" +
  "|radio\\s+edit|mono(?:\\s+version)?|stereo(?:\\s+version)?|\\d{4}\\s+(?:mix|version)"
const DASH_NOISE = new RegExp(`\\s+-\\s+(?:${NOISE})\\s*$`, "i")
const PAREN_NOISE = new RegExp(`\\s*[(\\[](?:${NOISE})[)\\]]`, "gi")

export function cleanTrackTitle(title: string): string {
  let t = title.trim()
  t = t.replace(PAREN_NOISE, "")
  // Pot haver-n'hi més d'un: «Cançó - Remastered 2011 - Mono»
  for (let prev = ""; prev !== t; ) {
    prev = t
    t = t.replace(DASH_NOISE, "")
  }
  return t.trim() || title.trim()
}
