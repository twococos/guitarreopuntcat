import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getArtistBySlug } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ artistSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getT()
  const { artistSlug } = await params
  const artist = await getArtistBySlug(artistSlug)
  if (!artist) return { title: t.metadata.artist.noTrobat }

  const sample = artist.songs.slice(0, 3).map((s) => s.title).join(", ")
  return {
    title: t.metadata.artist.title(artist.name),
    description:
      artist.songs.length === 1
        ? t.metadata.artist.descriptionSingle(artist.name, artist.songs[0].title)
        : t.metadata.artist.descriptionMultiple(artist.name, artist.songs.length, sample),
    openGraph: {
      title: t.metadata.artist.ogTitle(artist.name),
      description: t.metadata.artist.ogDescription(artist.songs.length),
    },
  }
}

/**
 * /songs/[artistSlug] — pàgina pública d'un artista.
 *
 * Llista totes les cançons públiques d'aquell artista. Conviu amb
 * `/songs/[artistSlug]/[songSlug]/page.tsx` — Next.js prioritza la ruta
 * més específica automàticament.
 */
export default async function ArtistPage({ params }: Props) {
  const t = getT()
  const { artistSlug } = await params
  const artist = await getArtistBySlug(artistSlug)
  if (!artist) notFound()

  return (
    <>
      <PublicNav />
      <div className="public-artist-page">
        <header className="public-artist-header">
          <p className="public-artist-eyebrow">{t.public.publicArtist.artista}</p>
        <h1 className="public-artist-name">{artist.name}</h1>
        <p className="public-artist-count">
          {t.public.publicArtist.countCancons(artist.songs.length)}
        </p>
      </header>

      <main className="public-artist-main">
        <ul className="public-artist-songs">
          {artist.songs.map((s) => (
            <li key={s.id} className="public-artist-song">
              <Link
                href={`/songs/${artist.slug}/${s.song_slug}`}
                className="public-artist-song-link"
              >
                <span className="public-artist-song-title">{s.title}</span>
                <span className="public-artist-song-meta">
                  <span className="public-artist-song-key">{s.key}</span>
                  {s.year && <span className="public-artist-song-year">{s.year}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      </div>
    </>
  )
}
