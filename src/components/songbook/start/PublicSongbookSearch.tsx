"use client"
import { useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { IconBookOpen, IconCopy, IconEye, IconX } from "@/components/shared/Icons"

interface SongbookResult {
  id: number
  title: string
  slug: string
  owner_name: string
  song_count: number
  top_artists: string[]
  artist_count: number
}

interface Props {
  busy: boolean
  onCopy: (id: number) => void
}

/**
 * Cerca de cançoners públics dins l'overlay d'inici, amb l'aspecte de la
 * barra de la portada (`.search-hero`) però amb resultats en llista fixa:
 * cada un es pot copiar a l'editor o mirar en una pestanya nova.
 * Sense text, mostra els més visitats.
 */
export function PublicSongbookSearch({ busy, onCopy }: Props) {
  const t = getT()
  const ts = t.app.songbook.startOverlay
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SongbookResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const term = q.trim()
    setLoading(true)
    // Sense text no cal esperar: els populars surten de seguida
    const timer = setTimeout(() => {
      const myId = ++requestIdRef.current
      const params = new URLSearchParams({ limit: "12" })
      if (term) params.set("q", term)
      fetch(`/api/songbooks/search?${params}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ songbooks: SongbookResult[] }>) : null))
        .then((data) => {
          // Ignora respostes obsoletes (l'usuari segueix escrivint)
          if (myId !== requestIdRef.current) return
          setResults(data?.songbooks ?? [])
          setLoading(false)
        })
        .catch(() => {
          if (myId !== requestIdRef.current) return
          setResults([])
          setLoading(false)
        })
    }, term ? 200 : 0)
    return () => clearTimeout(timer)
  }, [q])

  const term = q.trim()

  return (
    <div className="start-overlay-public">
      <h2 className="start-overlay-title">{ts.publicsTitol}</h2>
      <p className="start-overlay-hint">{ts.publicsHint}</p>

      <div className="search-hero start-overlay-search">
        <div className="search-hero-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="search-hero-input"
            placeholder={ts.publicsPlaceholder}
            value={q}
            autoFocus
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            aria-label={ts.publicsPlaceholder}
          />
          {q && (
            <button
              type="button"
              className="search-hero-clear"
              onClick={() => {
                setQ("")
                inputRef.current?.focus()
              }}
              aria-label={t.public.searchHero.esborraAriaLabel}
            >
              <IconX />
            </button>
          )}
        </div>
      </div>

      <div className="start-overlay-results" aria-busy={loading || busy}>
        {!term && results !== null && results.length > 0 && (
          <div className="search-hero-section-label">{ts.publicsPopulars}</div>
        )}
        {results === null && loading && <div className="search-hero-empty">{t.public.searchHero.cercant}</div>}
        {results !== null && results.length === 0 && !loading && (
          <div className="search-hero-empty">{term ? ts.sensResultats(term) : ts.publicsCap}</div>
        )}
        {results?.map((b, i) => (
          <div
            key={b.id}
            className="search-hero-result start-overlay-result"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="search-hero-result-icon" aria-hidden="true">
              <IconBookOpen />
            </span>
            <span className="search-hero-result-main">
              <span className="search-hero-result-title">{b.title}</span>
              <span className="search-hero-result-sub">
                {t.public.searchHero.canconerDe(
                  t.public.songbooksHome.artistes(b.top_artists, b.artist_count),
                  b.song_count,
                )}
                {" · "}
                {t.public.songbooksHome.per(b.owner_name)}
              </span>
            </span>
            <a
              className="start-overlay-result-btn"
              href={`/songbooks/${b.id}/${b.slug}`}
              target="_blank"
              rel="noreferrer"
              title={ts.mirarTitle}
            >
              <IconEye /> {ts.mirar}
            </a>
            <button
              type="button"
              className="start-overlay-result-btn is-primary"
              disabled={busy}
              onClick={() => onCopy(b.id)}
            >
              <IconCopy /> {ts.copiar}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
