import "server-only"
import { spotifyGet } from "./client.server"
import { EMBED_PLAYLIST_CAP, parseEmbedHtml, type EmbedEntity } from "./embed"
import {
  isSpotifyShortLink,
  parseSpotifyRef,
  releaseYear,
  spotifyUrl,
  type SpotifyKind,
  type SpotifyRef,
  type SpotifyTrack,
} from "./url"

/** Màxim de cançons que es carreguen d'un enllaç (un àlbum molt llarg, una compilació…). */
const MAX_TRACKS = 500

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// ─── Tipus de l'API (només el que es fa servir) ─────────────

interface ApiImage {
  url?: string
  width?: number | null
}
interface ApiAlbum {
  name?: string
  release_date?: string
  images?: ApiImage[]
}
interface ApiTrack {
  id?: string
  name?: string
  duration_ms?: number
  artists?: Array<{ name?: string }>
  album?: ApiAlbum
}
interface ApiPage<T> {
  items?: T[]
  next?: string | null
}

/** La imatge més petita que faci com a mínim 64 px (les llistes la mostren petita). */
function pickImage(images: ApiImage[] | undefined): string | null {
  if (!images?.length) return null
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (sorted.find((i) => (i.width ?? 0) >= 64) ?? sorted[sorted.length - 1]).url ?? null
}

function mapTrack(t: ApiTrack, album: ApiAlbum | undefined = t.album): SpotifyTrack | null {
  if (!t.id || !t.name) return null
  return {
    spotify_id: t.id,
    url: spotifyUrl("track", t.id),
    title: t.name,
    artists: (t.artists ?? []).map((a) => a.name?.trim() ?? "").filter(Boolean),
    album: album?.name?.trim() || null,
    year: releaseYear(album?.release_date),
    duration_ms: t.duration_ms ?? 0,
    image_url: pickImage(album?.images),
  }
}

// ─── Cançons ────────────────────────────────────────────────

/** Metadades completes d'una cançó (`GET /tracks/{id}`): àlbum, any, artistes i portada. */
export async function getTrack(id: string): Promise<SpotifyTrack | null> {
  const t = await spotifyGet<ApiTrack>(`/tracks/${encodeURIComponent(id)}`)
  return t ? mapTrack(t) : null
}

/** Cerca de cançons per text (l'API en dona com a molt 10). */
export async function searchTracks(q: string): Promise<SpotifyTrack[] | null> {
  const data = await spotifyGet<{ tracks?: ApiPage<ApiTrack> }>(
    `/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
  )
  if (!data) return null
  return (data.tracks?.items ?? []).map((t) => mapTrack(t)).filter((t): t is SpotifyTrack => t !== null)
}

// ─── Enllaços ───────────────────────────────────────────────

export interface ResolvedSpotify {
  kind: SpotifyKind
  name: string
  image_url: string | null
  tracks: SpotifyTrack[]
  /** La font en tenia més de les que s'han pogut llegir (llistes: l'incrustat en dona 100). */
  truncated: boolean
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<{ text: string; finalUrl: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,ca;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    })
    if (!res.ok) return null
    return { text: await res.text(), finalUrl: res.url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** `spotify.link/…`: se segueix la redirecció fins a l'enllaç llarg. */
async function resolveShortLink(input: string): Promise<SpotifyRef | null> {
  const res = await fetchText(input.trim())
  if (!res) return null
  const direct = parseSpotifyRef(res.finalUrl)
  if (direct) return direct
  // Algunes redireccions passen per una pàgina intermèdia amb l'enllaç dins l'HTML
  const m = /https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:track|playlist|album|artist)\/[A-Za-z0-9]{22}/.exec(
    res.text,
  )
  return m ? parseSpotifyRef(m[0]) : null
}

/** Amb un reintent: de tant en tant Spotify respon buit a peticions seguides. */
async function fetchEmbed(kind: "playlist" | "artist", id: string): Promise<EmbedEntity | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000))
    const res = await fetchText(`https://open.spotify.com/embed/${kind}/${id}`)
    const entity = res ? parseEmbedHtml(res.text) : null
    if (entity) return entity
  }
  return null
}

async function resolveAlbum(id: string): Promise<ResolvedSpotify | null> {
  const album = await spotifyGet<ApiAlbum & { tracks?: ApiPage<ApiTrack> }>(`/albums/${encodeURIComponent(id)}`)
  if (!album) return null
  const items = [...(album.tracks?.items ?? [])]
  let next = album.tracks?.next ?? null
  while (next && items.length < MAX_TRACKS) {
    const path = next.replace(/^https:\/\/api\.spotify\.com\/v1/, "")
    const page = await spotifyGet<ApiPage<ApiTrack>>(path)
    if (!page) break
    items.push(...(page.items ?? []))
    next = page.next ?? null
  }
  return {
    kind: "album",
    name: album.name ?? "",
    image_url: pickImage(album.images),
    // Les cançons d'un àlbum no porten l'àlbum: és el mateix per a totes
    tracks: items
      .slice(0, MAX_TRACKS)
      .map((t) => mapTrack(t, album))
      .filter((t): t is SpotifyTrack => t !== null),
    truncated: !!next,
  }
}

/**
 * Cançons d'un enllaç de Spotify: cançó i àlbum per l'API; llista i artista per
 * l'incrustat (l'API ja no els dona). Null si l'enllaç no és vàlid o no s'ha pogut llegir.
 */
export async function resolveSpotify(input: string): Promise<ResolvedSpotify | null> {
  const ref = parseSpotifyRef(input) ?? (isSpotifyShortLink(input) ? await resolveShortLink(input) : null)
  if (!ref) return null

  if (ref.kind === "track") {
    const track = await getTrack(ref.id)
    if (!track) return null
    return { kind: "track", name: track.title, image_url: track.image_url, tracks: [track], truncated: false }
  }
  if (ref.kind === "album") return resolveAlbum(ref.id)

  const entity = await fetchEmbed(ref.kind, ref.id)
  if (!entity) return null
  return {
    kind: ref.kind,
    name: entity.name,
    image_url: entity.image_url,
    tracks: entity.tracks.slice(0, MAX_TRACKS),
    truncated: ref.kind === "playlist" && entity.tracks.length >= EMBED_PLAYLIST_CAP,
  }
}
