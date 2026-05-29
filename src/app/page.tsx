import Link from "next/link"
import { listRecentPublicSongs, getRandomPublicSong } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { SearchHero } from "@/components/public/SearchHero"
import { InspiratSection } from "@/components/public/InspiratSection"

export const dynamic = "force-dynamic"

/**
 * Portada pública (/) — punt d'entrada principal del domini.
 *
 * Estructura:
 *   1. Nav superior (logo + links + UserWidget).
 *   2. Hero: logo gros + wordmark + claim + buscador prominent.
 *   3. CTA secundari per anar a l'editor de cançoners (/app).
 *   4. Inspira't: cançó aleatòria amb botó "tira el dau".
 *   5. Llista de cançons recents.
 *
 * `force-dynamic` perquè la tirada inicial del dau sigui diferent cada visita
 * (sense aquesta directiva, Next podria cache-jar la portada estàticament).
 */
export default async function HomePage() {
  const [recent, randomSong] = await Promise.all([
    listRecentPublicSongs(8),
    getRandomPublicSong(),
  ])

  return (
    <>
      <PublicNav />

      <main className="public-home">
        <section className="public-home-hero">
          <img src="/img/Logo.png" alt="" className="public-home-logo" />
          <h1 className="public-home-title">guitarreo.cat</h1>
          <p className="public-home-claim">
            Acords i lletres en català — i un editor de cançoners propi.
          </p>

          <SearchHero />

          <div className="public-home-secondary">
            <Link href="/app" className="public-home-secondary-cta">
              Crea un cançoner
            </Link>
            <span className="public-home-secondary-sep">·</span>
            <Link href="/songs" className="public-home-secondary-link">
              Explora el catàleg
            </Link>
          </div>
        </section>

        <InspiratSection
          initial={
            randomSong
              ? {
                  id: randomSong.id,
                  title: randomSong.title,
                  artist: randomSong.artist,
                  artist_slug: randomSong.artist_slug,
                  song_slug: randomSong.song_slug,
                  key: randomSong.key,
                  year: randomSong.year ?? null,
                }
              : null
          }
        />

        {recent.length > 0 && (
          <section className="public-home-section">
            <header className="public-home-section-head">
              <h2 className="public-home-section-title">Últimes incorporades</h2>
              <Link href="/songs" className="public-home-section-link">
                Veure totes →
              </Link>
            </header>
            <ul className="public-home-grid">
              {recent.map((s) =>
                s.artist_slug && s.song_slug ? (
                  <li key={s.id} className="public-home-card">
                    <Link
                      href={`/songs/${s.artist_slug}/${s.song_slug}`}
                      className="public-home-card-link"
                    >
                      <span className="public-home-card-title">{s.title}</span>
                      <span className="public-home-card-artist">{s.artist}</span>
                      <span className="public-home-card-key">{s.key}</span>
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}
