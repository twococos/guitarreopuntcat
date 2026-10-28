import { spotifyUrl, type SpotifyTrack } from "./url"

/**
 * Lectura del reproductor incrustat de Spotify (`open.spotify.com/embed/{kind}/{id}`).
 * Pur: la descàrrega és a embed.server.ts.
 *
 * La pàgina és Next.js i porta les dades a `__NEXT_DATA__`:
 * `props.pageProps.state.data.entity` → `name`, `coverArt.sources[]` i
 * `trackList[]` (`uri`, `title`, `subtitle` = artistes separats per comes,
 * `duration` en ms). Una llista hi surt retallada a 100 cançons i un artista
 * hi dona els seus 10 èxits. No hi ha ni àlbum ni any (s'omplen després amb
 * `GET /tracks/{id}`).
 */

/** Màxim de cançons que dona l'incrustat d'una llista. */
export const EMBED_PLAYLIST_CAP = 100

export interface EmbedEntity {
  name: string
  image_url: string | null
  tracks: SpotifyTrack[]
}

interface RawEntity {
  name?: unknown
  title?: unknown
  coverArt?: { sources?: Array<{ url?: unknown }> }
  trackList?: Array<{ uri?: unknown; title?: unknown; subtitle?: unknown; duration?: unknown }>
}

export function parseEmbedHtml(html: string): EmbedEntity | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  if (!m) return null
  let data: unknown
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }
  const entity = (data as { props?: { pageProps?: { state?: { data?: { entity?: RawEntity } } } } })?.props
    ?.pageProps?.state?.data?.entity
  if (!entity || !Array.isArray(entity.trackList)) return null

  const tracks: SpotifyTrack[] = []
  for (const t of entity.trackList) {
    const id = typeof t.uri === "string" ? /^spotify:track:([A-Za-z0-9]{22})$/.exec(t.uri)?.[1] : undefined
    if (!id || typeof t.title !== "string") continue
    const artists =
      typeof t.subtitle === "string"
        ? t.subtitle
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
        : []
    tracks.push({
      spotify_id: id,
      url: spotifyUrl("track", id),
      title: t.title,
      artists,
      album: null,
      year: null,
      duration_ms: typeof t.duration === "number" ? t.duration : 0,
      image_url: null,
    })
  }
  const name = typeof entity.name === "string" ? entity.name : typeof entity.title === "string" ? entity.title : ""
  const cover = entity.coverArt?.sources?.find((s) => typeof s.url === "string")?.url
  return { name, image_url: typeof cover === "string" ? cover : null, tracks }
}
