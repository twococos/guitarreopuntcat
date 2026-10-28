import "server-only"
import { spotifyGet } from "@/lib/spotify/client.server"
import { releaseYear } from "@/lib/spotify/url"

export { isSpotifyConfigured } from "@/lib/spotify/client.server"

/**
 * Cerca el primer track de Spotify que coincideixi amb `{title} {artist}`
 * usant l'API oficial /v1/search (client a src/lib/spotify/client.server.ts).
 */

export interface SpotifyTrackInfo {
  /** URL pública del track: https://open.spotify.com/track/{id} */
  url: string
  /** Nom de l'àlbum tal com el dona Spotify. Pot ser un single (mateix nom que la cançó). */
  album: string | null
  /** Any de publicació de l'àlbum (4 dígits), extret de release_date. */
  year: number | null
}

/**
 * Cerca el primer track i retorna URL + àlbum + any (best-effort) del primer
 * match, o null si no n'hi ha o si Spotify no està configurat / API ha fallat.
 *
 * Construcció de la query: usem el format específic de l'API
 * `track:"…" artist:"…"` que dona millors resultats que text lliure.
 */
export async function findSpotifyTrack(
  artist: string,
  title: string,
): Promise<SpotifyTrackInfo | null> {
  const t = title.trim()
  const a = artist.trim()
  if (!t || !a) return null

  const q = `track:"${t}" artist:"${a}"`
  const data = await spotifyGet<{
    tracks?: {
      items?: Array<{
        external_urls?: { spotify?: string }
        album?: {
          name?: string
          release_date?: string
        }
      }>
    }
  }>(`/search?q=${encodeURIComponent(q)}&type=track&limit=1`)
  if (!data) return null

  const first = data.tracks?.items?.[0]
  const trackUrl = first?.external_urls?.spotify
  if (!trackUrl) return null
  return { url: trackUrl, album: first?.album?.name?.trim() || null, year: releaseYear(first?.album?.release_date) }
}
