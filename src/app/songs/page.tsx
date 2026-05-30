import type { Metadata } from "next"
import Link from "next/link"
import { getPublicSongsByLetter, getPublicArtistsByLetter } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { MobileGateLink } from "@/components/public/MobileGateLink"

export const metadata: Metadata = {
  title: "Cançons — guitarreo.cat",
  description:
    "Catàleg complet de cançons amb acords i lletra a guitarreo.cat, navegable per títol o per artista.",
}

interface Props {
  searchParams: Promise<{ by?: string; letter?: string }>
}

/**
 * /songs — índex del catàleg amb dos modes (per cançó / per artista).
 *
 * La capçalera és full-bleed (banner d'ample complet), amb el contingut
 * (títol + SearchHero compacte a la dreta) limitat als marges del catàleg.
 * El selector A-Z ocupa el centre de la barra següent i el toggle
 * cançó/artista s'hi alinea a la dreta.
 */
export default async function SongsIndexPage({ searchParams }: Props) {
  const { by: byParam, letter: letterParam } = await searchParams
  const by: "letter" | "artist" = byParam === "artist" ? "artist" : "letter"

  const data = by === "artist" ? await getPublicArtistsByLetter() : await getPublicSongsByLetter()

  const letters = Object.keys(data).sort(sortLetterKeys)
  const total = Object.values(data).reduce((acc, arr) => acc + arr.length, 0)

  // Lletra activa: la de l'URL si existeix i té contingut, si no la primera.
  const requestedLetter = letterParam?.toUpperCase()
  const activeLetter =
    requestedLetter && letters.includes(requestedLetter) ? requestedLetter : (letters[0] ?? null)

  const activeEntries = activeLetter ? data[activeLetter] : []
  const letterHref = (l: string) =>
    by === "artist" ? `/songs?by=artist&letter=${l}` : `/songs?letter=${l}`

  return (
    <>
      <PublicNav />

      {/* Capçalera full-bleed amb el títol del catàleg. La cerca viu ara a la
          PublicNav (compartida amb la resta de pàgines públiques). */}
      <header className="songs-index-banner">
        <div className="songs-index-banner-inner">
          <div className="songs-index-banner-text">
            <h1 className="songs-index-title">
              <span className="songs-index-title-main">
                {by === "artist" ? "Catàleg d'artistes" : "Catàleg de cançons"}
              </span>
              {total > 0 && (
                <span className="songs-index-count">
                  {by === "artist"
                    ? `${total} ${total === 1 ? "artista" : "artistes"}`
                    : `${total} ${total === 1 ? "cançó" : "cançons"}`}
                </span>
              )}
              {total === 0 && (
                <span className="songs-index-count">Encara no hi ha res publicat</span>
              )}
            </h1>
          </div>
        </div>
      </header>

      <div className="songs-index">
        {letters.length > 0 && (
          <>
            {/* Selector A-Z horitzontal amb el toggle cançó/artista a la dreta */}
            <nav className="songs-index-az-bar" aria-label="Saltar a inicial">
              <div className="songs-index-az-pills">
                {letters.map((l) => (
                  <Link
                    key={l}
                    href={letterHref(l)}
                    scroll={false}
                    prefetch={false}
                    className={`songs-index-az-pill ${l === activeLetter ? "is-active" : ""}`}
                    aria-current={l === activeLetter ? "page" : undefined}
                  >
                    {l}
                  </Link>
                ))}
              </div>
              <div className="songs-index-toggle" aria-label="Mode d'índex" role="group">
                <Link
                  href="/songs"
                  className={`songs-index-toggle-btn ${by === "letter" ? "is-active" : ""}`}
                  prefetch={false}
                >
                  Per cançó
                </Link>
                <Link
                  href="/songs?by=artist"
                  className={`songs-index-toggle-btn ${by === "artist" ? "is-active" : ""}`}
                  prefetch={false}
                >
                  Per artista
                </Link>
              </div>
            </nav>

            {activeLetter && (
              <section className="songs-index-group" aria-labelledby="active-letter-heading">
                <h2 id="active-letter-heading" className="songs-index-group-heading">
                  {activeLetter}
                </h2>
                <ul className="songs-index-list">
                  {by === "artist"
                    ? (activeEntries as ArtistEntry[]).map((a) => (
                        <li key={a.slug} className="songs-index-item">
                          <Link href={`/songs/${a.slug}`} className="songs-index-link">
                            <span className="songs-index-item-title">{a.name}</span>
                            <span className="songs-index-item-sub">
                              {a.song_count === 1 ? "1 cançó" : `${a.song_count} cançons`}
                            </span>
                          </Link>
                        </li>
                      ))
                    : (activeEntries as SongEntry[]).map((s) => (
                        <li key={s.id} className="songs-index-item">
                          <Link
                            href={`/songs/${s.artist_slug}/${s.song_slug}`}
                            className="songs-index-link"
                          >
                            <span className="songs-index-item-main">
                              <span className="songs-index-item-title">{s.title}</span>
                              <span className="songs-index-item-sub">{s.artist}</span>
                            </span>
                            <span className="songs-index-item-key">{s.key}</span>
                          </Link>
                        </li>
                      ))}
                </ul>
              </section>
            )}
          </>
        )}

        {total === 0 && (
          <p className="songs-index-empty">
            Quan hi hagi cançons publicades, apareixeran aquí.{" "}
            <MobileGateLink href="/app">Vés a l&apos;editor</MobileGateLink> per proposar-ne.
          </p>
        )}
      </div>
    </>
  )
}

// Tipus inferits dels helpers (mateixa forma que retornen)
type SongEntry = {
  id: number
  title: string
  artist: string
  artist_slug: string
  song_slug: string
  key: string
}
type ArtistEntry = { name: string; slug: string; song_count: number }

/** Ordena lletres A-Z, deixa "#" al final. */
function sortLetterKeys(a: string, b: string): number {
  if (a === "#" && b !== "#") return 1
  if (b === "#" && a !== "#") return -1
  return a.localeCompare(b)
}
