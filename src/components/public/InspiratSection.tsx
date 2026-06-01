"use client"
import Link from "next/link"
import { useState } from "react"
import { getT } from "@/lib/i18n"

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
  initial: SongLite[]
}

/**
 * InspiratSection — fila de cançons públiques aleatòries a la portada amb un
 * botó "Tira el dau" per re-cercar-ne de noves sense recarregar.
 *
 * Les primeres cançons arriben renderitzades des del servidor (SEO + zero
 * flash). Les següents tirades es demanen a /api/songs/random?count=N&exclude=...
 */
export function InspiratSection({ initial }: Props) {
  const t = getT()
  const [songs, setSongs] = useState<SongLite[]>(initial)
  const [loading, setLoading] = useState(false)
  const [rolling, setRolling] = useState(false)
  // S'incrementa a cada tirada per forçar React a recrear els <li> i així
  // re-disparar l'animació d'entrada de les targetes.
  const [rollKey, setRollKey] = useState(0)

  async function roll() {
    if (loading) return
    setLoading(true)
    setRolling(true)
    try {
      const count = songs.length || 3
      const params = new URLSearchParams()
      params.set("count", String(count))
      for (const s of songs) params.append("exclude", String(s.id))
      const res = await fetch(`/api/songs/random?${params.toString()}`)
      if (!res.ok) return
      const data: { songs: SongLite[] } = await res.json()
      if (data.songs && data.songs.length > 0) {
        setSongs(data.songs)
        setRollKey((k) => k + 1)
      }
    } catch {
      // silenci — l'usuari pot tornar a clicar
    } finally {
      setLoading(false)
      // L'animació del dau dura una mica més perquè doni "sensació" de tirada
      setTimeout(() => setRolling(false), 350)
    }
  }

  if (songs.length === 0) {
    // Sense cap cançó pública encara: amaga la secció.
    return null
  }

  return (
    <section className="public-home-section inspirat">
      <header className="public-home-section-head">
        <h2 className="public-home-section-title">
          {t.public.inspirat.titol}
          <span className="public-home-section-subtitle">
            {" "}{t.public.inspirat.subtitol}
          </span>
        </h2>
        <button
          type="button"
          className={`inspirat-dice-btn ${rolling ? "is-rolling" : ""}`}
          onClick={roll}
          disabled={loading}
          aria-label={t.public.inspirat.tiraDauAriaLabel}
          title={t.public.inspirat.tiraDauTitle}
        >
          <svg
            className="inspirat-dice-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3.2-6.9" />
            <polyline points="21 4 21 9 16 9" />
          </svg>
        </button>
      </header>

      <ul className="public-home-grid">
        {songs.map((s, i) =>
          s.artist_slug && s.song_slug ? (
            <li
              key={`${rollKey}-${s.id}`}
              className="public-home-card public-home-card--reroll"
              style={{ "--i": i } as React.CSSProperties}
            >
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
  )
}
