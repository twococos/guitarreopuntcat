import type { Metadata } from "next"
import Link from "next/link"
import {
  getPublicSongsByLetter,
  getPublicArtistsByLetter,
} from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { SearchHero } from "@/components/public/SearchHero"

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
 * Tot al servidor: només es renderitza la lletra activa (de l'URL `?letter=X`,
 * o la primera disponible per defecte). El selector A-Z viu en horitzontal
 * just sota la capçalera amb cerca, i és el que canvia la lletra activa.
 */
export default async function SongsIndexPage({ searchParams }: Props) {
  const { by: byParam, letter: letterParam } = await searchParams
  const by: "letter" | "artist" = byParam === "artist" ? "artist" : "letter"

  const data =
    by === "artist"
      ? await getPublicArtistsByLetter()
      : await getPublicSongsByLetter()

  const letters = Object.keys(data).sort(sortLetterKeys)
  const total = Object.values(data).reduce((acc, arr) => acc + arr.length, 0)

  // Lletra activa: la de l'URL si existeix i té contingut, si no la primera.
  const requestedLetter = letterParam?.toUpperCase()
  const activeLetter =
    requestedLetter && letters.includes(requestedLetter)
      ? requestedLetter
      : letters[0] ?? null

  const activeEntries = activeLetter ? data[activeLetter] : []
  const letterHref = (l: string) =>
    by === "artist" ? `/songs?by=artist&letter=${l}` : `/songs?letter=${l}`

  return (
    <>
      <PublicNav />
      <div className="songs-index">
        <header className="songs-index-header">
          <p className="songs-index-eyebrow">Catàleg</p>
          <h1 className="songs-index-title">
            {by === "artist" ? "Artistes" : "Cançons"}
          </h1>
          <p className="songs-index-count">
            {total === 0
              ? "Encara no hi ha res publicat."
              : by === "artist"
                ? `${total} ${total === 1 ? "artista" : "artistes"}`
                : `${total} ${total === 1 ? "cançó" : "cançons"}`}
          </p>

          <nav className="songs-index-toggle" aria-label="Mode d'índex">
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
          </nav>

          <div className="songs-index-search">
            <SearchHero
              compact
              placeholder={
                by === "artist"
                  ? "Cerca un artista o cançó…"
                  : "Cerca una cançó o un artista…"
              }
            />
          </div>
        </header>

        {letters.length > 0 && (
          <>
            {/* Selector A-Z horitzontal — sticky, sota la nav */}
            <nav className="songs-index-az-bar" aria-label="Saltar a inicial">
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
            </nav>

            {activeLetter && (
              <section
                className="songs-index-group"
                aria-labelledby="active-letter-heading"
              >
                <h2 id="active-letter-heading" className="songs-index-group-heading">
                  {activeLetter}
                </h2>
                <ul className="songs-index-list">
                  {by === "artist"
                    ? (activeEntries as ArtistEntry[]).map((a) => (
                        <li key={a.slug} className="songs-index-item">
                          <Link
                            href={`/songs/${a.slug}`}
                            className="songs-index-link"
                          >
                            <span className="songs-index-item-title">{a.name}</span>
                            <span className="songs-index-item-sub">
                              {a.song_count === 1
                                ? "1 cançó"
                                : `${a.song_count} cançons`}
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
            <Link href="/app">Vés a l&apos;editor</Link> per proposar-ne.
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
