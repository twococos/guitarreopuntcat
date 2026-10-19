"use client"
import Link from "next/link"
import { useState } from "react"
import { getT } from "@/lib/i18n"

interface SongbookLite {
  id: number
  title: string
  slug: string
  accent_color: string | null
  owner_name: string
  song_count: number
  top_artists: string[]
  artist_count: number
}

/**
 * SongbooksSection — cançoners públics a l'atzar a la portada, amb el mateix
 * "Tira el dau" que InspiratSection (/api/songbooks/random). Si no n'hi ha
 * cap de públic, la secció no surt.
 */
export function SongbooksSection({ initial }: { initial: SongbookLite[] }) {
  const t = getT()
  const tt = t.public.songbooksHome
  const [songbooks, setSongbooks] = useState<SongbookLite[]>(initial)
  const [loading, setLoading] = useState(false)
  const [rolling, setRolling] = useState(false)
  // Força recrear els <li> perquè es torni a disparar l'animació d'entrada
  const [rollKey, setRollKey] = useState(0)

  async function roll() {
    if (loading) return
    setLoading(true)
    setRolling(true)
    try {
      const params = new URLSearchParams({ count: String(songbooks.length || 3) })
      for (const s of songbooks) params.append("exclude", String(s.id))
      const res = await fetch(`/api/songbooks/random?${params.toString()}`)
      if (!res.ok) return
      const data: { songbooks: SongbookLite[] } = await res.json()
      if (data.songbooks.length > 0) {
        setSongbooks(data.songbooks)
        setRollKey((k) => k + 1)
      }
    } catch {
      // silenci — l'usuari pot tornar a clicar
    } finally {
      setLoading(false)
      setTimeout(() => setRolling(false), 350)
    }
  }

  if (songbooks.length === 0) return null

  return (
    <section className="public-home-section">
      <header className="public-home-section-head">
        <h2 className="public-home-section-title">
          {tt.titol}
          <span className="public-home-section-subtitle"> {tt.subtitol}</span>
        </h2>
        <button
          type="button"
          className={`inspirat-dice-btn ${rolling ? "is-rolling" : ""}`}
          onClick={roll}
          disabled={loading}
          aria-label={tt.tiraDauAriaLabel}
          title={tt.tiraDauTitle}
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
        {songbooks.map((s, i) => (
          <li
            key={`${rollKey}-${s.id}`}
            className="public-home-card public-home-card--reroll"
            style={{ "--i": i } as React.CSSProperties}
          >
            <Link
              href={`/songbooks/${s.id}/${s.slug}`}
              className="public-home-card-link public-home-card-link--songbook"
            >
              <span className="public-home-card-title">{s.title}</span>
              <span className="public-home-card-artist">{tt.per(s.owner_name)}</span>
              <span className="public-home-card-artists">{tt.artistes(s.top_artists, s.artist_count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
