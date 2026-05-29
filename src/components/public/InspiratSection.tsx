"use client"
import Link from "next/link"
import { useState } from "react"

interface SongLite {
  id: number
  title: string
  artist: string
  artist_slug: string | null
  song_slug: string | null
  key: string
  year?: number | null
}

interface Props {
  initial: SongLite | null
}

/**
 * InspiratSection — destaca una cançó pública aleatòria a la portada amb un
 * botó "Tira el dau" per re-cercar-ne una de nova sense recarregar.
 *
 * La primera cançó arriba renderitzada des del servidor (SEO + zero flash).
 * Les següents tirades es demanen a /api/songs/random?exclude=ID.
 */
export function InspiratSection({ initial }: Props) {
  const [song, setSong] = useState<SongLite | null>(initial)
  const [loading, setLoading] = useState(false)
  const [rolling, setRolling] = useState(false)

  async function roll() {
    if (loading) return
    setLoading(true)
    setRolling(true)
    try {
      const url = song
        ? `/api/songs/random?exclude=${song.id}`
        : "/api/songs/random"
      const res = await fetch(url)
      if (!res.ok) return
      const data: { song: SongLite | null } = await res.json()
      if (data.song) setSong(data.song)
    } catch {
      // silenci — l'usuari pot tornar a clicar
    } finally {
      setLoading(false)
      // L'animació del dau dura una mica més perquè doni "sensació" de tirada
      setTimeout(() => setRolling(false), 350)
    }
  }

  if (!song) {
    // Sense cap cançó pública encara: amaga la secció.
    return null
  }

  const href =
    song.artist_slug && song.song_slug
      ? `/songs/${song.artist_slug}/${song.song_slug}`
      : null

  return (
    <section className="public-home-section inspirat">
      <header className="public-home-section-head">
        <h2 className="public-home-section-title">Inspira&apos;t</h2>
        <button
          type="button"
          className={`inspirat-dice ${rolling ? "is-rolling" : ""}`}
          onClick={roll}
          disabled={loading}
          aria-label="Tira el dau per veure una altra cançó"
          title="Tira el dau"
        >
          <span className="inspirat-dice-emoji" aria-hidden="true">🎲</span>
          <span className="inspirat-dice-label">Tira el dau</span>
        </button>
      </header>

      <div className="inspirat-card">
        <div className="inspirat-card-meta">
          <span className="inspirat-card-eyebrow">Cançó aleatòria</span>
          <h3 className="inspirat-card-title">{song.title}</h3>
          <p className="inspirat-card-artist">{song.artist}</p>
          <div className="inspirat-card-badges">
            <span className="inspirat-card-key">{song.key}</span>
            {song.year ? (
              <span className="inspirat-card-year">{song.year}</span>
            ) : null}
          </div>
        </div>
        {href && (
          <Link href={href} className="inspirat-card-cta">
            Obre la cançó →
          </Link>
        )}
      </div>
    </section>
  )
}
