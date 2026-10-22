"use client"
/**
 * Disposició del reproductor «Toca-la»:
 *  - `PlayerPanel`: escriptori ample, columna esquerra enganxosa al costat de la targeta (vídeo,
 *    acord que sona amb la tira de compassos, seccions i ajustos).
 *  - Pantalles estretes: el panell deixa només el vídeo, com a miniatura flotant que es pot
 *    plegar (l'iframe no es desmunta mai: plegar-lo no l'atura), i `PlayerStrip` és una franja
 *    sobre la barra de controls amb l'acord, les seccions i un full d'ajustos.
 *  - `PlayerButton`: primer botó de la barra de controls. Obre el reproductor i després fa de
 *    play/pausa.
 */

import { useSession } from "next-auth/react"
import { getT } from "@/lib/i18n"
import { IconPause, IconPlay, IconSettings, IconX, IconChevronDown, IconChevronUp } from "@/components/shared/Icons"
import { ModeSwitch, NowPlaying, PlayerSettings, SectionChips } from "./PlayerParts"
import { usePlayer, usePlayerActions } from "./PlayerProvider"

/** El reproductor no surt si la sincronització és dolenta, llevat dels admins (amb avís). */
export function usePlayerAllowed(quality: { ok: boolean } | null): { allowed: boolean; warn: boolean } {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"
  if (!quality) return { allowed: false, warn: false }
  if (quality.ok) return { allowed: true, warn: false }
  return { allowed: isAdmin, warn: isAdmin }
}

export function PlayerButton() {
  const tp = getT().public.player
  const open = usePlayer((s) => s.open)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.open && s.status === "loading")
  const actions = usePlayerActions()
  if (!open) {
    return (
      <div className="public-song-bar-group player-bar-group">
        <button
          type="button"
          className="public-song-btn player-start-btn"
          onClick={actions.start}
          onPointerEnter={actions.prefetch}
          onFocus={actions.prefetch}
          title={tp.tocalaTitle}
        >
          <IconPlay /> <span className="player-start-label">{tp.tocala}</span>
        </button>
      </div>
    )
  }
  return (
    <div className="public-song-bar-group player-bar-group">
      <button
        type="button"
        className={`public-song-btn player-toggle-btn${playing ? " is-playing" : ""}`}
        onClick={actions.toggle}
        disabled={loading}
        aria-label={playing ? tp.pausa : tp.play}
        title={playing ? tp.pausa : tp.play}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
    </div>
  )
}

function StatusLine() {
  const tp = getT().public.player
  const status = usePlayer((s) => s.status)
  const error = usePlayer((s) => s.error)
  if (status === "loading") return <p className="player-status">{tp.carregant}</p>
  if (error === "load") return <p className="player-status is-error">{tp.errorCarrega}</p>
  if (error === "video") return <p className="player-status">{tp.errorVideo}</p>
  return null
}

function FollowButton({ compact = false }: { compact?: boolean }) {
  const tp = getT().public.player
  const following = usePlayer((s) => s.following)
  const actions = usePlayerActions()
  if (following) return null
  return (
    <button
      type="button"
      className={`player-follow-btn${compact ? " is-compact" : ""}`}
      onClick={() => actions.setFollowing(true)}
    >
      {tp.tornaALaLinia}
    </button>
  )
}

export function PlayerPanel({ warn }: { warn: boolean }) {
  const tp = getT().public.player
  const mode = usePlayer((s) => s.mode)
  const videoOk = usePlayer((s) => s.videoOk)
  const collapsed = usePlayer((s) => s.videoCollapsed)
  const actions = usePlayerActions()
  const showVideo = mode === "video" && videoOk

  return (
    <aside className="player-panel" aria-label={tp.titol}>
      <div className="player-panel-head">
        <span className="player-title">{tp.titol}</span>
        <button type="button" className="player-icon-btn" onClick={actions.close} aria-label={tp.tancar} title={tp.tancar}>
          <IconX />
        </button>
      </div>
      <ModeSwitch />
      <div className={`player-video-box${showVideo ? "" : " is-hidden"}${collapsed ? " is-collapsed" : ""}`}>
        <div className="player-video" ref={actions.setVideoElement} />
        <button
          type="button"
          className="player-video-toggle"
          onClick={() => actions.setVideoCollapsed(!collapsed)}
          aria-label={collapsed ? tp.videoMostra : tp.videoAmaga}
          title={collapsed ? tp.videoMostra : tp.videoAmaga}
        >
          {collapsed ? <IconChevronUp /> : <IconChevronDown />}
        </button>
      </div>
      <StatusLine />
      <NowPlaying />
      <SectionChips />
      <FollowButton />
      <PlayerSettings />
      {warn && <p className="player-warn">{tp.avisAdmin}</p>}
    </aside>
  )
}

export function PlayerStrip({ warn }: { warn: boolean }) {
  const tp = getT().public.player
  const settingsOpen = usePlayer((s) => s.settingsOpen)
  const actions = usePlayerActions()
  return (
    <>
      <div className="player-strip" role="region" aria-label={tp.titol}>
        <NowPlaying compact />
        <SectionChips compact />
        <FollowButton compact />
        <button
          type="button"
          className={`player-icon-btn${settingsOpen ? " is-active" : ""}`}
          onClick={() => actions.setSettingsOpen(!settingsOpen)}
          aria-label={tp.ajustos}
          aria-expanded={settingsOpen}
          title={tp.ajustos}
        >
          <IconSettings />
        </button>
        <button type="button" className="player-icon-btn" onClick={actions.close} aria-label={tp.tancar} title={tp.tancar}>
          <IconX />
        </button>
      </div>
      {settingsOpen && (
        <div className="player-sheet" role="dialog" aria-label={tp.ajustos}>
          <div className="player-sheet-head">
            <span className="player-title">{tp.ajustos}</span>
            <button type="button" className="player-icon-btn" onClick={() => actions.setSettingsOpen(false)} aria-label={tp.tancar}>
              <IconX />
            </button>
          </div>
          <StatusLine />
          <ModeSwitch />
          <SectionChips />
          <PlayerSettings />
          {warn && <p className="player-warn">{tp.avisAdmin}</p>}
        </div>
      )}
    </>
  )
}
