"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getT } from "@/lib/i18n"

interface ArtistResult {
  name: string
  slug: string
  song_count: number
}

interface SongResult {
  id: number
  title: string
  artist: string
  artist_slug: string | null
  song_slug: string | null
  key: string
}

interface SearchResponse {
  artists: ArtistResult[]
  songs: SongResult[]
}

type Item =
  | { kind: "artist"; data: ArtistResult; href: string }
  | { kind: "song"; data: SongResult; href: string }

interface SearchHeroProps {
  /** Variant compacta — fa el control més petit (per a la pàgina /songs). */
  compact?: boolean
  /** Placeholder customitzable. */
  placeholder?: string
  /**
   * Si està activat, el wrapper rep la classe `is-expanded` mentre l'input té
   * focus. Per a la variant compacta, això permet que CSS l'expandeixi a
   * ocupar tota l'amplada disponible i activi el backdrop difuminat —
   * imitant el comportament de l'hero gros de la portada.
   */
  expandOnFocus?: boolean
}

/**
 * SearchHero — input principal de cerca de la portada.
 *
 * On-type amb debounce 200ms cerca a /api/songs/search. Mostra un dropdown
 * amb dues seccions (Artistes + Cançons) i permet navegació amb teclat
 * (↑/↓/Enter/Escape). Si l'usuari clica fora, es tanca.
 */
export function SearchHero({
  compact = false,
  placeholder,
  expandOnFocus = false,
}: SearchHeroProps = {}) {
  const t = getT()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  // Llista plana per a navegació amb teclat: primer artistes, després cançons.
  const items = useMemo<Item[]>(() => {
    if (!results) return []
    const out: Item[] = []
    for (const a of results.artists) {
      out.push({ kind: "artist", data: a, href: `/songs/${a.slug}` })
    }
    for (const s of results.songs) {
      if (s.artist_slug && s.song_slug) {
        out.push({
          kind: "song",
          data: s,
          href: `/songs/${s.artist_slug}/${s.song_slug}`,
        })
      }
    }
    return out
  }, [results])

  /* ── Debounced fetch ─────────────────────────────────────── */

  useEffect(() => {
    const term = q.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!term) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const myId = ++requestIdRef.current
      fetch(`/api/songs/search?q=${encodeURIComponent(term)}&limit=8`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: SearchResponse | null) => {
          // Ignora respostes obsoletes (cas: l'usuari segueix escrivint)
          if (myId !== requestIdRef.current) return
          setResults(data)
          setFocusedIdx(-1)
          setLoading(false)
        })
        .catch(() => {
          if (myId === requestIdRef.current) {
            setResults(null)
            setLoading(false)
          }
        })
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  /* ── Tancar al clicar fora ───────────────────────────────── */

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  /* ── Teclat ──────────────────────────────────────────────── */

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setOpen(false)
        inputRef.current?.blur()
        return
      }
      if (items.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setFocusedIdx((i) => (i + 1) % items.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setFocusedIdx((i) => (i <= 0 ? items.length - 1 : i - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const target = focusedIdx >= 0 ? items[focusedIdx] : items[0]
        if (target) {
          setOpen(false)
          router.push(target.href)
        }
      }
    },
    [items, focusedIdx, router],
  )

  const showDropdown =
    open && (loading || (results !== null && items.length === 0) || items.length > 0)

  return (
    <div
      className={`search-hero ${compact ? "search-hero--compact" : ""} ${expandOnFocus ? "search-hero--expandable" : ""} ${expandOnFocus && focused ? "is-expanded" : ""}`}
      ref={wrapRef}
    >
      <div className="search-hero-input-wrap">
        {compact && (
          <span className="search-hero-icon" aria-hidden="true">
            {/* Icona lupa inline — només a la variant compacta (/songs) */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          className="search-hero-input"
          placeholder={placeholder ?? t.public.nav.cercaPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setFocused(true)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          aria-label={t.public.searchHero.ariaLabel}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        {q && (
          <button
            type="button"
            className="search-hero-clear"
            onClick={() => {
              setQ("")
              setResults(null)
              setFocusedIdx(-1)
              inputRef.current?.focus()
            }}
            aria-label={t.public.searchHero.esborraAriaLabel}
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="search-hero-dropdown"
          role="listbox"
          onMouseDown={(e) => {
            // Evita que clicar zones no interactives del dropdown (labels,
            // separadors) tregui el focus de l'input — això faria desaparèixer
            // el backdrop difuminat. Els <Link>/<a> reben el click igualment.
            if ((e.target as HTMLElement).closest("a")) return
            e.preventDefault()
          }}
        >
          {loading && items.length === 0 && (
            <div className="search-hero-empty">{t.public.searchHero.cercant}</div>
          )}

          {!loading && results !== null && items.length === 0 && (
            <div className="search-hero-empty">{t.public.searchHero.sensResultats(q)}</div>
          )}

          {results && results.artists.length > 0 && (
            <div className="search-hero-section">
              <div className="search-hero-section-label">{t.public.searchHero.artistes}</div>
              {results.artists.map((a, i) => {
                const idx = i
                const focused = idx === focusedIdx
                return (
                  <Link
                    key={a.slug}
                    href={`/songs/${a.slug}`}
                    className={`search-hero-result search-hero-result--artist ${focused ? "is-focused" : ""}`}
                    style={{ "--i": idx } as React.CSSProperties}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    onClick={() => setOpen(false)}
                    role="option"
                    aria-selected={focused}
                  >
                    <span className="search-hero-result-icon" aria-hidden="true">
                      ♪
                    </span>
                    <span className="search-hero-result-main">
                      <span className="search-hero-result-title">{a.name}</span>
                      <span className="search-hero-result-sub">
                        {t.public.searchHero.songCount(a.song_count)}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}

          {results && results.songs.length > 0 && (
            <div className="search-hero-section">
              <div className="search-hero-section-label">{t.public.searchHero.cancons}</div>
              {results.songs.map((s, i) => {
                if (!s.artist_slug || !s.song_slug) return null
                const idx = (results.artists?.length ?? 0) + i
                const focused = idx === focusedIdx
                return (
                  <Link
                    key={s.id}
                    href={`/songs/${s.artist_slug}/${s.song_slug}`}
                    className={`search-hero-result ${focused ? "is-focused" : ""}`}
                    style={{ "--i": idx } as React.CSSProperties}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    onClick={() => setOpen(false)}
                    role="option"
                    aria-selected={focused}
                  >
                    <span className="search-hero-result-main">
                      <span className="search-hero-result-title">{s.title}</span>
                      <span className="search-hero-result-sub">{s.artist}</span>
                    </span>
                    <span className="search-hero-result-key">{s.key}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
