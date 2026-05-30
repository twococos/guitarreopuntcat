"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { PublicKeyMenu } from "@/components/songs/PublicKeyMenu"
import { guardMobileApp } from "@/components/public/MobileGateLink"
import { transposeKey, transposeContent, CHROMATIC } from "@/lib/transpose"
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

/* Velocitats: clarament més lentes que abans. El nivell 1 és un degoteig
   adequat a lectura tranquil·la, i la corba s'aplana cap als nivells alts. */
const SCROLL_SPEEDS = [1, 2, 3, 4, 5] as const
const SCROLL_PX_PER_TICK: Record<number, number> = {
  1: 0.1,
  2: 0.2,
  3: 0.35,
  4: 0.55,
  5: 0.85,
}

/**
 * PublicSongView — vista pública interactiva d'una cançó.
 *
 * Layout principal: targeta blanca centrada amb la capçalera (títol, artista
 * clicable, tonalitat clicable que obre KeyPicker i CTA per crear cançoner) i
 * a sota el body de la cançó.
 *
 * Controls (transposició, mida i autoscroll) en barra flotant a baix de tot.
 */
export function PublicSongView({ song }: Props) {
  const router = useRouter()
  const [semitones, setSemitones] = useState(0)
  const [fontSize, setFontSize] = useState(FONT_DEFAULT)
  const [scrollSpeed, setScrollSpeed] = useState<number>(2)
  const [autoscroll, setAutoscroll] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [keyPickerOpen, setKeyPickerOpen] = useState(false)
  const [keyPickerPos, setKeyPickerPos] = useState({ x: 0, y: 0 })
  const keyBadgeRef = useRef<HTMLButtonElement>(null)
  const autoBtnRef = useRef<HTMLButtonElement>(null)

  const displayKey = transposeKey(song.key, semitones)
  const transposedContent = transposeContent(song.content, semitones)
  const showOriginal = displayKey !== song.key

  /* ── Autoscroll ──────────────────────────────────────────── */

  const lastScrollY = useRef<number>(0)

  useEffect(() => {
    if (!autoscroll) return

    let raf = 0
    let last = performance.now()
    /* Acumulador de píxels fraccionals: window.scrollBy arrodoneix els
       valors < 1 a 0, de manera que a velocitats baixes el desplaçament
       per frame (típicament < 1 px) no es traduïa en cap moviment real.
       Acumulem aquí i només cridem scrollBy quan tenim ≥ 1 px sencer. */
    let acc = 0

    function tick(now: number) {
      const dt = now - last
      last = now
      const pxPerMs = (SCROLL_PX_PER_TICK[scrollSpeed] ?? 0.2) / 16
      acc += pxPerMs * dt
      if (acc >= 1) {
        const whole = Math.floor(acc)
        acc -= whole
        window.scrollBy({ top: whole, behavior: "instant" })
        lastScrollY.current = window.scrollY
      }
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

  /* ── Tanca el popover de velocitat en clicar fora ────────── */

  useEffect(() => {
    if (!speedMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (!autoBtnRef.current) return
      const t = e.target as Node
      if (
        autoBtnRef.current.contains(t) ||
        (t instanceof Element && t.closest(".public-song-speed-popover"))
      ) {
        return
      }
      setSpeedMenuOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [speedMenuOpen])

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

  function openKeyPicker(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (!keyBadgeRef.current) return
    const r = keyBadgeRef.current.getBoundingClientRect()
    setKeyPickerPos({ x: r.left, y: r.bottom + 6 })
    setKeyPickerOpen(true)
  }

  /** Tria d'una tonalitat al KeyPicker → calcula semitons entre la original
   *  (song.key) i la triada. Així el camp `semitones` continua sent l'unica
   *  font de veritat per a la transposició. */
  function handleKeyChange(newKey: string) {
    const delta = semitonesBetweenKeys(song.key, newKey)
    if (delta !== null) {
      // Normalitza dins de [-11, +11] preferint el camí més curt.
      let d = delta
      if (d > SEMITONES_MAX) d -= 12
      if (d < SEMITONES_MIN) d += 12
      setSemitones(d)
    }
  }

  function pickSpeed(s: number) {
    setScrollSpeed(s)
    setSpeedMenuOpen(false)
    setAutoscroll(true)
  }

  function onAutoClick() {
    // Mòbil: obre popover de velocitat. Si l'autoscroll ja està actiu,
    // un segon clic l'atura. Desktop: toggle directe.
    if (autoscroll) {
      setAutoscroll(false)
      setSpeedMenuOpen(false)
      return
    }
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setSpeedMenuOpen((v) => !v)
    } else {
      setAutoscroll(true)
    }
  }

  function startCanconerWithThisSong() {
    if (guardMobileApp()) return
    sessionStorage.setItem(
      "start_with_song",
      JSON.stringify({ songId: song.id, semitones }),
    )
    router.push("/app")
  }

  const artistHref = song.artist_slug ? `/songs/${song.artist_slug}` : null
  const subline = formatSubline(song.album, song.year, song.capo)

  return (
    <div
      className="public-song-page"
      style={{ ["--song-font-size" as string]: `${fontSize}px` }}
    >
      <main className="public-song-main">
        <article className="public-song-card song" data-style="classic">
          <div className="public-song-header">
            <div className="public-song-title-row">
              <h1 className="public-song-title">{song.title}</h1>
              <div className="public-song-header-actions">
                <button
                  ref={keyBadgeRef}
                  type="button"
                  className="public-song-key-badge song-key"
                  onClick={openKeyPicker}
                  aria-label="Canviar tonalitat"
                  aria-haspopup="dialog"
                  aria-expanded={keyPickerOpen}
                  title="Canviar tonalitat"
                >
                  <span className="public-song-key-current">{displayKey}</span>
                  {showOriginal && (
                    <span className="public-song-key-original">
                      − Orig. {song.key}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="public-song-header-cta"
                  onClick={startCanconerWithThisSong}
                >
                  Comença un cançoner
                </button>
              </div>
            </div>
            <p className="public-song-artist-line">
              {artistHref ? (
                <Link href={artistHref} className="public-song-artist-link">
                  {song.artist}
                </Link>
              ) : (
                <span>{song.artist}</span>
              )}
              {subline && <span className="public-song-subline">{subline}</span>}
            </p>
          </div>

          <div
            className="song-body"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: transposedContent }}
          />
        </article>

        <div className="public-song-cta-wrap">
          <button
            type="button"
            className="public-song-cta"
            onClick={startCanconerWithThisSong}
          >
            Comença un cançoner amb aquesta cançó →
          </button>
          <p className="public-song-cta-hint">
            Crea un llibret amb les teves cançons preferides, transposa-les i
            exporta-les en PDF.
          </p>
        </div>
      </main>

      {/* Barra de controls flotant a baix */}
      <div className="public-song-floating-bar" role="toolbar" aria-label="Controls de la cançó">
        <div className="public-song-floating-bar-inner">
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
              <span className="public-song-semitones-full">
                {semitones === 0
                  ? "Original"
                  : semitones > 0
                    ? `+${semitones}`
                    : `${semitones}`}
              </span>
              <span className="public-song-semitones-short" aria-hidden="true">
                {semitones === 0 ? "0" : semitones > 0 ? `+${semitones}` : `${semitones}`}
              </span>
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

          <div className="public-song-bar-group public-song-autoscroll-group" aria-label="Autoscroll">
            <button
              ref={autoBtnRef}
              type="button"
              className={`public-song-btn public-song-autoscroll-toggle ${autoscroll ? "is-active" : ""}`}
              onClick={onAutoClick}
              aria-pressed={autoscroll}
              aria-haspopup="menu"
              aria-expanded={speedMenuOpen}
            >
              {autoscroll ? "■ Aturar" : "▶ Auto"}
            </button>
            {/* Desktop: selector de velocitat sempre visible */}
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
            {/* Mòbil: popover de selecció que apareix sobre el botó Auto */}
            {speedMenuOpen && (
              <div
                className="public-song-speed-popover"
                role="menu"
                aria-label="Tria una velocitat"
              >
                <div className="public-song-speed-popover-label">Velocitat</div>
                <div className="public-song-speed-popover-grid">
                  {SCROLL_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`public-song-speed-popover-btn ${scrollSpeed === s ? "is-active" : ""}`}
                      onClick={() => pickSpeed(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublicKeyMenu
        open={keyPickerOpen}
        originalKey={song.key}
        currentKey={displayKey}
        x={keyPickerPos.x}
        y={keyPickerPos.y}
        onSelect={handleKeyChange}
        onClose={() => setKeyPickerOpen(false)}
      />
    </div>
  )
}

/* ── Helpers locals ────────────────────────────────────────── */

function formatSubline(
  album: string | null | undefined,
  year: number | null | undefined,
  capo: number | null | undefined,
): string | null {
  const parts: string[] = []
  if (album && year) parts.push(`${album} (${year})`)
  else if (album) parts.push(album)
  else if (year) parts.push(String(year))
  if (capo) parts.push(`Celleta ${capo}`)
  return parts.length ? parts.join(" · ") : null
}

/** Retorna els semitons (positius) per anar de `from` a `to` dins l'octava.
 *  Tracta menors i majors igual: només compara arrels. Retorna null si no
 *  reconeix alguna de les claus. */
function semitonesBetweenKeys(from: string, to: string): number | null {
  const fromIdx = rootIndex(from)
  const toIdx = rootIndex(to)
  if (fromIdx === null || toIdx === null) return null
  return (toIdx - fromIdx + 12) % 12
}

function rootIndex(key: string): number | null {
  const m = key.match(/^([A-G][b#]?)/)
  if (!m) return null
  const root = m[1] ?? ""
  const flat: Record<string, string> = {
    Db: "C#",
    Eb: "D#",
    Fb: "E",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
    Cb: "B",
  }
  const norm = flat[root] ?? root
  const idx = (CHROMATIC as readonly string[]).indexOf(norm)
  return idx === -1 ? null : idx
}
