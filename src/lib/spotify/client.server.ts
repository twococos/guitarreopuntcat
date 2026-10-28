import "server-only"

/**
 * Client de l'API web de Spotify amb el flux Client Credentials.
 *
 * Requereix les variables d'entorn SPOTIFY_CLIENT_ID i SPOTIFY_CLIENT_SECRET
 * (app creada a https://developer.spotify.com/dashboard).
 *
 * Des de febrer de 2026, una app en Development Mode no pot llegir el contingut
 * de llistes alienes ni els èxits d'un artista, i la cerca dona com a molt 10
 * resultats. Per a llistes i artistes es fa servir el reproductor incrustat
 * (embed.server.ts).
 *
 * Token cache: els tokens client-credentials duren ~1h. Cachem en memòria
 * del procés Node fins 60s abans de la caducitat.
 */

interface CachedToken {
  value: string
  /** Epoch ms en què deixarem d'usar-lo (60s abans de l'expiry real). */
  validUntil: number
}

let cached: CachedToken | null = null

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
}

export async function getSpotifyToken(): Promise<string | null> {
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

/**
 * GET a `https://api.spotify.com/v1{path}`. Null si Spotify no està configurat,
 * la resposta no és 2xx o se supera el temps límit. Mai llença.
 */
export async function spotifyGet<T>(path: string, timeoutMs = 10_000): Promise<T | null> {
  const token = await getSpotifyToken().catch(() => null)
  if (!token) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
