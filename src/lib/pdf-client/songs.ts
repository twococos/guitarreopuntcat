import type { CanconerEntry } from "@/types/song"
import type { PdfSong } from "./types"

/* Conversió de cançons a PdfSong per a la vista prèvia. Mòdul lleuger
 * (només tipus): es pot importar sense carregar el paginador. */

/** Les cançons del store són tal com les retorna l'API (snake_case),
 *  encara que el tipus `Song` digui camelCase. */
export function entriesToPdfSongs(entries: CanconerEntry[]): PdfSong[] {
  return entries.map(({ song, semitones }) => {
    const raw = song as unknown as {
      title: string
      artist: string
      key: string
      capo: number | null
      content: string
      album: string | null
      year: number | null
      youtube_url: string | null
      spotify_url: string | null
    }
    return {
      title: raw.title,
      artist: raw.artist,
      key: raw.key,
      capo: raw.capo ?? null,
      content: raw.content ?? "",
      semitones,
      album: raw.album ?? null,
      year: raw.year ?? null,
      youtubeUrl: raw.youtube_url ?? null,
      spotifyUrl: raw.spotify_url ?? null,
    }
  })
}
