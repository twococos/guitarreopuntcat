/**
 * Estats de `songs.state` i tipus de cançó derivat. Pur: servidor i navegador.
 *
 * "Arranjament" no és un estat: és una privada amb `original_song_id`.
 * Qui pot veure cada tipus: src/lib/access/songs.ts.
 */

export const SONG_STATE = {
  PUBLIC: 0,
  PRIVATE: 1,
  PENDING: 2,
} as const

export type SongKind = "public" | "private" | "arrangement" | "proposal"

export function songKind(state: number, originalSongId: number | null | undefined): SongKind {
  if (state === SONG_STATE.PUBLIC) return "public"
  if (state === SONG_STATE.PENDING) return "proposal"
  return originalSongId != null ? "arrangement" : "private"
}

/** URL on es mostra una cançó: la pública si en té, si no el visor privat. */
export function songHref(song: {
  id: number
  state: number
  artist_slug: string | null
  song_slug: string | null
}): string {
  if (song.state === SONG_STATE.PUBLIC && song.artist_slug && song.song_slug) {
    return `/songs/${song.artist_slug}/${song.song_slug}`
  }
  return `/songs/private/${song.id}`
}
