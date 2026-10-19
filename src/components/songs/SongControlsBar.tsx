"use client"
import type { ReactNode } from "react"
import { getT } from "@/lib/i18n"
import { IconPlay, IconSharp, IconFlat } from "@/components/shared/Icons"
import {
  FONT_MAX,
  FONT_MIN,
  SCROLL_SPEEDS,
  SEMITONES_MAX,
  SEMITONES_MIN,
  type ReaderControls,
} from "./useReaderControls"

/**
 * Barra flotant de controls de les pàgines públiques: transposició, notació,
 * mida i autoscroll. `children` s'afegeix al principi (p. ex. anterior/següent
 * al visor de cançoners).
 */
export function SongControlsBar({
  controls: c,
  semitones,
  onSemitonesChange,
  children,
}: {
  controls: ReaderControls
  semitones: number
  onSemitonesChange: (s: number) => void
  children?: ReactNode
}) {
  const t = getT()
  const tc = t.public.publicSong.controls
  const label = semitones === 0 ? "0" : semitones > 0 ? `+${semitones}` : `${semitones}`

  return (
    <div className="public-song-floating-bar" role="toolbar" aria-label={tc.ariaLabel}>
      <div className="public-song-floating-bar-inner">
        {children}
        <div className="public-song-bar-group" aria-label={tc.transposicio}>
          <button
            type="button"
            className="public-song-btn"
            onClick={() => onSemitonesChange(Math.max(SEMITONES_MIN, semitones - 1))}
            aria-label={tc.baixaUnSemito}
            disabled={semitones <= SEMITONES_MIN}
          >
            −
          </button>
          <button
            type="button"
            className="public-song-semitones"
            onClick={() => onSemitonesChange(0)}
            title={tc.restablirTonalitatTitle}
            aria-label={tc.restablirTonalitatAriaLabel}
          >
            <span className="public-song-semitones-full">
              {semitones === 0 ? tc.original : label}
            </span>
            <span className="public-song-semitones-short" aria-hidden="true">
              {label}
            </span>
          </button>
          <button
            type="button"
            className="public-song-btn"
            onClick={() => onSemitonesChange(Math.min(SEMITONES_MAX, semitones + 1))}
            aria-label={tc.pujaUnSemito}
            disabled={semitones >= SEMITONES_MAX}
          >
            +
          </button>
        </div>

        <div className="public-song-bar-group" aria-label={tc.notacio}>
          <button
            type="button"
            className={`public-song-btn ${c.flats ? "is-active" : ""}`}
            onClick={c.toggleFlats}
            aria-pressed={c.flats}
            aria-label={c.flats ? tc.mostrarSostinguts : tc.mostrarBemolls}
            title={c.flats ? tc.mostrarSostinguts : tc.mostrarBemolls}
          >
            {c.flats ? <IconFlat /> : <IconSharp />}
          </button>
        </div>

        <div className="public-song-bar-group" aria-label={tc.midaDeLaFont}>
          <button
            type="button"
            className="public-song-btn public-song-btn-font-sm"
            onClick={c.fontSmaller}
            aria-label={tc.reduirMida}
            disabled={c.fontSize <= FONT_MIN}
          >
            A
          </button>
          <button
            type="button"
            className="public-song-btn public-song-btn-font-lg"
            onClick={c.fontBigger}
            aria-label={tc.augmentarMida}
            disabled={c.fontSize >= FONT_MAX}
          >
            A
          </button>
        </div>

        <div className="public-song-bar-group public-song-autoscroll-group" aria-label={tc.autoscroll}>
          <button
            ref={c.autoBtnRef}
            type="button"
            className={`public-song-btn public-song-autoscroll-toggle ${c.autoscroll ? "is-active" : ""}`}
            onClick={c.onAutoClick}
            aria-pressed={c.autoscroll}
            aria-haspopup="menu"
            aria-expanded={c.speedMenuOpen}
          >
            {c.autoscroll ? <>{tc.aturar}</> : <><IconPlay /> {tc.auto}</>}
          </button>
          {/* Desktop: selector de velocitat sempre visible */}
          <div className="public-song-speed" role="group" aria-label={tc.velocitatAutoscroll}>
            {SCROLL_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`public-song-speed-btn ${c.scrollSpeed === s ? "is-active" : ""}`}
                onClick={() => c.setScrollSpeed(s)}
                aria-label={tc.velocitatN(s)}
                aria-pressed={c.scrollSpeed === s}
              >
                {s}
              </button>
            ))}
          </div>
          {/* Mòbil: popover de selecció que apareix sobre el botó Auto */}
          {c.speedMenuOpen && (
            <div className="public-song-speed-popover" role="menu" aria-label={tc.triaUnaVelocitat}>
              <div className="public-song-speed-popover-label">{tc.velocitat}</div>
              <div className="public-song-speed-popover-grid">
                {SCROLL_SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`public-song-speed-popover-btn ${c.scrollSpeed === s ? "is-active" : ""}`}
                    onClick={() => c.pickSpeed(s)}
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
  )
}
