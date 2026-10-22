/**
 * src/lib/player/controller.ts — Controlador del reproductor (només navegador).
 *
 * Lliga les peces: carrega l'anàlisi i la sincronització, construeix la cronologia, tria l'estil,
 * fa l'arranjament i el passa al motor, i porta el rellotge del mode actiu:
 *  - "video": el vídeo de YouTube marca el temps i és l'únic que sona (la lletra el segueix).
 *  - "solo":  l'AudioContext marca el temps; l'acompanyament sona en el to que es veu (+ celleta).
 * La UI (store de React) rep els canvis d'estat per `onChange` i llegeix la posició amb `now()`.
 * Es carrega amb import() dinàmic el primer cop que l'usuari prem play.
 */

import type { AnalysisCompact } from "../schemas/transcriber"
import type { SyncResult } from "../transcriber/sync"
import { arrange, type Groove } from "./arrange"
import { AudioClock, YouTubeClock, type MediaClock } from "./clocks"
import { AccompanimentEngine } from "./engine"
import { DEFAULT_MIX, type Mix, type PlayerMode } from "./options"
import { STYLES, defaultStyle, effectiveStyle, isStyleId, type StyleId } from "./styles"
import { barStartAt, buildTimeline, type Timeline } from "./timeline"
import { YT_EMBED_ERRORS, YT_STATE, createYouTubePlayer, type YTPlayer } from "./youtube"

export type { Mix, PlayerMode }
export type StyleSource = "fixed" | "detected" | "default" | "user"


export interface ControllerState {
  status: "loading" | "ready" | "error"
  error: "load" | "video" | null
  mode: PlayerMode
  playing: boolean
  /** El vídeo es pot fer servir (hi és i es deixa incrustar). */
  videoOk: boolean
  style: StyleId
  styleSource: StyleSource
  detected: { style: StyleId; confidence: number } | null
  rate: number
  timeline: Timeline | null
}

export interface ControllerOptions {
  songId: number
  youtubeId: string | null
  capo: number
  /** Estil fixat per l'admin (`songs.rhythm`). */
  fixedStyle: string | null
  onChange: (patch: Partial<ControllerState>) => void
}

interface AnalysisResponse {
  analysis: AnalysisCompact & { rhythm?: { style?: string; confidence?: number; groove?: Groove } }
  sync: SyncResult
}

export class PlayerController {
  private ctx: AudioContext
  private engine: AccompanimentEngine
  private timeline: Timeline | null = null
  private groove: Groove | null = null
  private style: StyleId = "pop"
  private mode: PlayerMode
  private clock: MediaClock | null = null
  private ytClock: YouTubeClock | null = null
  private yt: YTPlayer | null = null
  private videoEl: HTMLElement | null = null
  private semitones = 0
  private mix: Mix = { ...DEFAULT_MIX }
  private rate: Record<PlayerMode, number> = { video: 1, solo: 1 }
  private destroyed = false
  /** Posició on ha de començar el vídeo quan estigui a punt. */
  private pendingPos: number | null = null
  /** Amb la pestanya amagada els temporitzadors van a batzegades: l'acompanyament no pot sonar. */
  private onVisibility = () => {
    if (document.hidden && this.mode === "solo" && this.isPlaying()) this.pause()
  }

  /** `ctx`: creat dins el clic de l'usuari (audioUnlock.ts); si no, Safari no deixa sonar res. */
  constructor(
    private opts: ControllerOptions,
    ctx: AudioContext,
  ) {
    this.ctx = ctx
    this.engine = new AccompanimentEngine(this.ctx)
    this.mode = opts.youtubeId ? "video" : "solo"
    document.addEventListener("visibilitychange", this.onVisibility)
  }

  // ── Càrrega ────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    this.opts.onChange({ status: "loading", mode: this.mode, videoOk: Boolean(this.opts.youtubeId) })
    let data: AnalysisResponse
    try {
      const res = await fetch(`/api/songs/${this.opts.songId}/analysis?sync=1`)
      if (!res.ok) throw new Error(String(res.status))
      data = (await res.json()) as AnalysisResponse
    } catch {
      if (!this.destroyed) this.opts.onChange({ status: "error", error: "load" })
      return
    }
    if (this.destroyed) return
    const tl = buildTimeline(data.analysis, data.sync)
    this.timeline = tl
    const rhythm = data.analysis.rhythm
    this.groove = rhythm?.groove ?? null
    const detected = isStyleId(rhythm?.style)
      ? { style: rhythm.style, confidence: rhythm.confidence ?? 0 }
      : null
    const eff = effectiveStyle(this.opts.fixedStyle, detected?.style, defaultStyle(tl.pulsesPerBar, tl.compound, tl.bpm))
    this.style = eff.id
    if (this.mode === "solo") this.rearrange()
    // A punt amb les dades: el vídeo pot trigar (i l'usuari ja pot passar a "només acompanyament")
    this.opts.onChange({ timeline: tl, style: eff.id, styleSource: eff.source, detected, status: "ready" })
    // En mode vídeo, el rellotge arriba quan el vídeo és a punt (setVideoElement / startVideo)
    if (this.mode === "video") await this.startVideo()
    else this.useSolo()
  }

  /** Element on es munta el vídeo (el registra la UI quan el panell és a la pàgina). */
  async setVideoElement(el: HTMLElement | null) {
    this.videoEl = el
    if (el && this.timeline && this.mode === "video" && !this.yt) await this.startVideo()
  }

  private async startVideo() {
    if (!this.opts.youtubeId || !this.videoEl || this.yt) return
    try {
      const player = await createYouTubePlayer(this.videoEl, this.opts.youtubeId, {
        onStateChange: (s) => this.onVideoState(s),
        onError: (code) => this.onVideoError(code),
        onRateChange: (r) => {
          this.ytClock?.setSpeed(r)
          this.opts.onChange({ rate: r })
        },
      })
      if (this.destroyed) {
        player.destroy()
        return
      }
      this.yt = player
      this.ytClock = new YouTubeClock(player)
      if (this.mode === "video") {
        this.clock = this.ytClock
        this.applyMode()
        if (this.pendingPos !== null) this.clock.seek(this.pendingPos)
        this.pendingPos = null
        // Primer play: si el navegador no deixa arrencar el vídeo sol, l'usuari el prem
        player.playVideo()
      }
    } catch {
      this.onVideoError(-1)
    }
  }

  private onVideoState(state: number) {
    this.ytClock?.setState(state)
    if (this.mode !== "video") return
    this.opts.onChange({ playing: state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING })
  }

  private onVideoError(code: number) {
    if (code !== -1 && !YT_EMBED_ERRORS.has(code)) return
    this.opts.onChange({ videoOk: false, error: "video" })
    if (this.mode === "video") this.setMode("solo")
  }

  // ── Modes ──────────────────────────────────────────────────────────────────

  private useSolo() {
    if (!this.timeline) return
    const pos = this.clock?.now() ?? 0
    const clock = new AudioClock(this.ctx, this.timeline.duration, () => this.opts.onChange({ playing: false }))
    clock.seek(pos)
    clock.setRate(this.rate.solo)
    this.clock = clock
    this.applyMode()
  }

  setMode(mode: PlayerMode) {
    if (mode === this.mode && this.clock) return
    const pos = this.clock?.now() ?? 0
    const wasPlaying = this.clock?.playing() ?? false
    this.clock?.pause()
    this.mode = mode
    if (mode === "video") {
      if (!this.ytClock) {
        this.pendingPos = pos
        this.engine.attach(null)
        this.clock = null
        this.opts.onChange({ mode, playing: false })
        void this.startVideo()
        return
      }
      this.clock = this.ytClock
      this.clock.seek(pos)
      this.applyMode()
      if (wasPlaying) this.clock.play()
    } else {
      this.useSolo()
      this.clock?.seek(pos)
      if (wasPlaying) this.play()
    }
    this.opts.onChange({ mode, playing: this.clock?.playing() ?? false })
  }

  /** En mode vídeo el motor no programa res; en mode sol segueix el rellotge de l'àudio. */
  private applyMode() {
    if (this.mode === "video") {
      this.engine.attach(null)
    } else {
      this.engine.setLevels(this.mix)
      this.engine.attach(this.clock)
      this.rearrange()
    }
    this.opts.onChange({ rate: this.rate[this.mode] })
  }

  // ── Arranjament ────────────────────────────────────────────────────────────

  /** Sona el que es veu: acords transposats + celleta. */
  private rearrange() {
    if (!this.timeline) return
    const pitchShift = this.semitones + this.opts.capo
    const events = arrange(this.timeline, { style: this.style, pitchShift, groove: this.groove })
    this.engine.setEvents(events)
  }

  setStyle(style: StyleId) {
    if (!STYLES[style]) return
    this.style = style
    if (this.mode === "solo") this.rearrange()
    this.opts.onChange({ style, styleSource: "user" })
  }

  setSemitones(semitones: number) {
    if (semitones === this.semitones) return
    this.semitones = semitones
    if (this.mode === "solo") this.rearrange()
  }

  setMix(mix: Partial<Mix>) {
    this.mix = { ...this.mix, ...mix }
    this.engine.setLevels(this.mix)
  }

  getMix(): Mix {
    return { ...this.mix }
  }

  /** Mescla desada (localStorage) de l'usuari. */
  restoreMix(saved: Partial<Mix>) {
    this.mix = { ...DEFAULT_MIX, ...saved }
    this.engine.setLevels(this.mix)
  }

  setRate(rate: number) {
    this.rate[this.mode] = rate
    this.clock?.setRate(rate)
    this.engine.resync()
    // En mode vídeo, YouTube la confirmarà (onPlaybackRateChange)
    this.opts.onChange({ rate })
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  /** Posició actual (ms de l'àudio original); en mode sol, el que ja se sent. */
  now(): number {
    if (!this.clock) return 0
    if (this.clock instanceof AudioClock) return Math.max(this.clock.heardNow(), 0)
    return this.clock.now()
  }

  isPlaying(): boolean {
    return this.clock?.playing() ?? false
  }

  play() {
    if (!this.clock || !this.timeline) return
    void this.ctx.resume()
    if (this.mode === "video") {
      this.clock.play()
      return
    }
    // Sol: des de l'inici del compàs, amb un compàs de compte enrere
    const tl = this.timeline
    let pos = this.clock.now()
    if (pos >= tl.duration - 500) pos = 0
    if (pos < tl.firstChordT) pos = tl.firstChordT
    pos = barStartAt(tl, pos)
    this.clock.seek(pos)
    const pulse = tl.pulses.find((p) => p.t >= pos) ?? tl.pulses[0]
    const delay = pulse ? this.engine.countIn(tl.pulsesPerBar, pulse.dur, this.rate.solo) : 0
    ;(this.clock as AudioClock).play(delay)
    this.engine.resync(pos)
    this.opts.onChange({ playing: true })
  }

  pause() {
    if (!this.clock) return
    this.clock.pause()
    this.engine.stopAll()
    if (this.mode === "solo") this.opts.onChange({ playing: false })
  }

  toggle() {
    if (this.isPlaying()) this.pause()
    else this.play()
  }

  seek(ms: number) {
    if (!this.clock) return
    this.clock.seek(ms)
    this.engine.resync(ms)
  }

  destroy() {
    this.destroyed = true
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.engine.destroy()
    this.clock?.destroy()
    try {
      this.yt?.destroy()
    } catch {
      // l'iframe ja no hi és
    }
    void this.ctx.close()
  }
}
