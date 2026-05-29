"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SongView } from "@/components/song/SongView"
import type { Song } from "@/types/song"

interface Props {
  song: Pick<
    Song,
    "id" | "title" | "artist" | "key" | "content" | "capo" | "album" | "year"
  > & {
    artist_slug: string | null
    song_slug: string | null
  }
}

const FONT_MIN = 12
const FONT_MAX = 22
const FONT_DEFAULT = 14

const SEMITONES_MIN = -11
const SEMITONES_MAX = 11

const SCROLL_SPEEDS = [1, 2, 3, 4, 5] as const
const SCROLL_PX_PER_TICK: Record<number, number> = { 1: 0.5, 2: 1, 3: 1.5, 4: 2.5, 5: 4 }

/**
 * PublicSongView — vista pública interactiva d'una cançó.
 *
 * Barra de controls sticky a dalt amb:
 *   · transposició ±semitons
 *   · mida de la font (afecta el body amb CSS variable)
 *   · autoscroll (toggle + velocitat)
 *
 * CTA gran a sota per a iniciar un nou cançoner amb aquesta cançó dins.
 */
export function PublicSongView({ song }: Props) {
  const router = useRouter()
  const [semitones, setSemitones] = useState(0)
  const [fontSize, setFontSize] = useState(FONT_DEFAULT)
  const [scrollSpeed, setScrollSpeed] = useState<number>(2)
  const [autoscroll, setAutoscroll] = useState(false)

  /* ── Autoscroll ──────────────────────────────────────────── */

  const lastScrollY = useRef<number>(0)

  useEffect(() => {
    if (!autoscroll) return

    let raf = 0
    let last = performance.now()

    function tick(now: number) {
      const dt = now - last
      last = now
      const pxPerMs = (SCROLL_PX_PER_TICK[scrollSpeed] ?? 1) / 16
      window.scrollBy({ top: pxPerMs * dt, behavior: "instant" })
      lastScrollY.current = window.scrollY
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // Si l'usuari fa scroll manual amunt, parem l'autoscroll
    function onUserScroll() {
      if (window.scrollY < lastScrollY.current - 5) {
        setAutoscroll(false)
      }
      lastScrollY.current = window.scrollY
    }
    window.addEventListener("wheel", onUserScroll, { passive: true })
    window.addEventListener("touchmove", onUserScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("wheel", onUserScroll)
      window.removeEventListener("touchmove", onUserScroll)
    }
  }, [autoscroll, scrollSpeed])

  /* ── Accions ─────────────────────────────────────────────── */

  const transposeDown = useCallback(() => {
    setSemitones((s) => Math.max(SEMITONES_MIN, s - 1))
  }, [])
  const transposeUp = useCallback(() => {
    setSemitones((s) => Math.min(SEMITONES_MAX, s + 1))
  }, [])
  const transposeReset = useCallback(() => setSemitones(0), [])

  const fontSmaller = useCallback(() => {
    setFontSize((f) => Math.max(FONT_MIN, f - 1))
  }, [])
  const fontBigger = useCallback(() => {
    setFontSize((f) => Math.min(FONT_MAX, f + 1))
  }, [])

  function startCanconerWithThisSong() {
    sessionStorage.setItem(
      "start_with_song",
      JSON.stringify({ songId: song.id, semitones }),
    )
    router.push("/app")
  }

  return (
    <div className="public-song-page" style={{ ["--song-font-size" as string]: `${fontSize}px` }}>
      <header className="public-song-bar">
        <div className="public-song-bar-group" aria-label="Transposició">
          <button
            type="button"
            className="public-song-btn"
            onClick={transposeDown}
            aria-label="Baixa un semitò"
            disabled={semitones <= SEMITONES_MIN}
          >
            −
          </button>
          <button
            type="button"
            className="public-song-semitones"
            onClick={transposeReset}
            title="Tornar a la tonalitat original"
            aria-label="Restablir tonalitat"
          >
            {semitones === 0 ? "Tonalitat" : semitones > 0 ? `+${semitones}` : `${semitones}`}
          </button>
          <button
            type="button"
            className="public-song-btn"
            onClick={transposeUp}
            aria-label="Puja un semitò"
            disabled={semitones >= SEMITONES_MAX}
          >
            +
          </button>
        </div>

        <div className="public-song-bar-group" aria-label="Mida de la font">
          <button
            type="button"
            className="public-song-btn public-song-btn-font-sm"
            onClick={fontSmaller}
            aria-label="Reduir mida"
            disabled={fontSize <= FONT_MIN}
          >
            A
          </button>
          <button
            type="button"
            className="public-song-btn public-song-btn-font-lg"
            onClick={fontBigger}
            aria-label="Augmentar mida"
            disabled={fontSize >= FONT_MAX}
          >
            A
          </button>
        </div>

        <div className="public-song-bar-group" aria-label="Autoscroll">
          <button
            type="button"
            className={`public-song-btn public-song-autoscroll-toggle ${autoscroll ? "is-active" : ""}`}
            onClick={() => setAutoscroll((v) => !v)}
            aria-pressed={autoscroll}
          >
            {autoscroll ? "■ Aturar" : "▶ Auto"}
          </button>
          <div className="public-song-speed" role="group" aria-label="Velocitat autoscroll">
            {SCROLL_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`public-song-speed-btn ${scrollSpeed === s ? "is-active" : ""}`}
                onClick={() => setScrollSpeed(s)}
                aria-label={`Velocitat ${s}`}
                aria-pressed={scrollSpeed === s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="public-song-main">
        <SongView song={song} semitones={semitones} />

        <div className="public-song-cta-wrap">
          <button
            type="button"
            className="public-song-cta"
            onClick={startCanconerWithThisSong}
          >
            Comença un cançoner amb aquesta cançó →
          </button>
          <p className="public-song-cta-hint">
            Crea un llibret amb les teves cançons preferides, transposa-les i exporta-les en PDF.
          </p>
        </div>
      </main>
    </div>
  )
}
