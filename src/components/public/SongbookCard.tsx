import Link from "next/link"
import { getT } from "@/lib/i18n"

export interface SongbookCardData {
  id: number
  title: string
  slug: string
  owner_name: string
  song_count: number
  top_artists: string[]
  artist_count: number
}

/**
 * Targeta d'un cançoner públic: títol, autor i nombre de cançons, i els
 * artistes principals. La fan servir la portada, /songbooks, la pàgina
 * d'artista i la de cançó. `fromSongId` obre el visor a aquella cançó.
 */
export function SongbookCard({ songbook: s, fromSongId }: { songbook: SongbookCardData; fromSongId?: number }) {
  const tt = getT().public.songbooksHome
  const href = `/songbooks/${s.id}/${s.slug}${fromSongId ? `?from=${fromSongId}` : ""}`
  return (
    <Link href={href} className="public-home-card-link public-home-card-link--songbook">
      <span className="public-home-card-title">{s.title}</span>
      <span className="public-home-card-artist">
        {tt.per(s.owner_name)} · {tt.numCancons(s.song_count)}
      </span>
      <span className="public-home-card-artists">{tt.artistes(s.top_artists, s.artist_count)}</span>
    </Link>
  )
}
