"use client"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Controls de lectura de les pàgines públiques (cançó i cançoner): notació,
 * mida de lletra i autoscroll. La transposició no hi és: en un cançoner cada
 * cançó té la seva, i la porta qui fa servir el hook.
 */

export const FONT_MIN = 12
export const FONT_MAX = 22
export const FONT_DEFAULT = 14

export const SEMITONES_MIN = -11
export const SEMITONES_MAX = 11

/* Velocitats: clarament més lentes que abans. El nivell 1 és un degoteig
   adequat a lectura tranquil·la, i la corba s'aplana cap als nivells alts. */
export const SCROLL_SPEEDS = [1, 2, 3, 4, 5] as const
const SCROLL_PX_PER_TICK: Record<number, number> = {
  1: 0.1,
  2: 0.2,
  3: 0.35,
  4: 0.55,
  5: 0.85,
}

export function useReaderControls() {
  const [flats, setFlats] = useState(false)
  const [fontSize, setFontSize] = useState(FONT_DEFAULT)
  const [scrollSpeed, setScrollSpeed] = useState<number>(2)
  const [autoscroll, setAutoscroll] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const autoBtnRef = useRef<HTMLButtonElement>(null)

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

  const fontSmaller = useCallback(() => {
    setFontSize((f) => Math.max(FONT_MIN, f - 1))
  }, [])
  const fontBigger = useCallback(() => {
    setFontSize((f) => Math.min(FONT_MAX, f + 1))
  }, [])

  const stopAutoscroll = useCallback(() => setAutoscroll(false), [])
  const toggleFlats = useCallback(() => setFlats((v) => !v), [])

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

  return {
    flats,
    toggleFlats,
    fontSize,
    fontSmaller,
    fontBigger,
    scrollSpeed,
    setScrollSpeed,
    autoscroll,
    stopAutoscroll,
    speedMenuOpen,
    pickSpeed,
    onAutoClick,
    autoBtnRef,
  }
}

export type ReaderControls = ReturnType<typeof useReaderControls>
