import "server-only"

/**
 * Cerca el primer track de Spotify que coincideixi amb `{title} {artist}`
 * usant l'API oficial /v1/search amb flow Client Credentials.
 *
 * Requereix les variables d'entorn:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *
 * Crea una app a https://developer.spotify.com/dashboard.
 *
 * Token cache: els tokens client-credentials duren ~1h. Cachem en memòria
 * del procés Node fins 60s abans de la caducitat. Cada serverless reload
 * el regenera, no és problema (és 1 POST extra per crear-lo).
 */

interface CachedToken {
  value: string
  /** Epoch ms en què deixarem d'usar-lo (60s abans de l'expiry real). */
  validUntil: number
}

let cached: CachedToken | null = null

async function getAccessToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) return null

  if (cached && cached.validUntil > Date.now()) return cached.value

  const basic = Buffer.from(`${id}:${secret}`).toString("base64")
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  const expiresIn = (data.expires_in ?? 3600) * 1000
  cached = {
    value: data.access_token,
    validUntil: Date.now() + expiresIn - 60_000,
  }
  return cached.value
}

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
}

/**
 * Retorna la URL pública open.spotify.com/track/{id} del primer match, o
 * null si no n'hi ha o si Spotify no està configurat / API ha fallat.
 *
 * Construcció de la query: usem el format específic de l'API
 * `track:"…" artist:"…"` que dona millors resultats que text lliure.
 */
export async function findSpotifyUrl(
  artist: string,
  title: string,
): Promise<string | null> {
  const t = title.trim()
  const a = artist.trim()
  if (!t || !a) return null

  const token = await getAccessToken()
  if (!token) return null

  const q = `track:"${t}" artist:"${a}"`
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      tracks?: { items?: Array<{ external_urls?: { spotify?: string } }> }
    }
    const first = data.tracks?.items?.[0]?.external_urls?.spotify
    return first ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
