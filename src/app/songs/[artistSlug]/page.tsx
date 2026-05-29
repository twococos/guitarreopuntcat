import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getArtistBySlug } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"

interface Props {
  params: Promise<{ artistSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artistSlug } = await params
  const artist = await getArtistBySlug(artistSlug)
  if (!artist) return { title: "Artista no trobat — guitarreo.cat" }

  const sample = artist.songs.slice(0, 3).map((s) => s.title).join(", ")
  return {
    title: `${artist.name} — Cançons amb acords | guitarreo.cat`,
    description:
      artist.songs.length === 1
        ? `Acords i lletra de "${artist.songs[0].title}" de ${artist.name}.`
        : `${artist.songs.length} cançons de ${artist.name} amb acords i lletra${
            sample ? `: ${sample}…` : ""
          }`,
    openGraph: {
      title: `${artist.name} a guitarreo.cat`,
      description: `${artist.songs.length} cançons amb acords i lletra`,
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
  const { artistSlug } = await params
  const artist = await getArtistBySlug(artistSlug)
  if (!artist) notFound()

  return (
    <>
      <PublicNav />
      <div className="public-artist-page">
        <header className="public-artist-header">
          <p className="public-artist-eyebrow">Artista</p>
        <h1 className="public-artist-name">{artist.name}</h1>
        <p className="public-artist-count">
          {artist.songs.length === 1 ? "1 cançó" : `${artist.songs.length} cançons`}
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
