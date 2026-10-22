/**
 * src/lib/player/clocks.ts — Rellotges de la reproducció (ms de l'àudio original).
 *
 * - `AudioClock`: mode «Només acompanyament». El temps el porta l'AudioContext; la velocitat
 *   estira la graella original (no es quantitza res). `now()` és el de programar les notes;
 *   `heardNow()`, el que se sent, per a la pantalla.
 * - `YouTubeClock`: mode «Amb la cançó». El temps és `getCurrentTime()` del vídeo.
 *
 * Totes dues lectures avancen a salts (`currentTime` a blocs de 10-50 ms; `getCurrentTime()` quan
 * arriba un missatge de l'iframe). Per a la pantalla passen per un `Smoother`: temps continu
 * amb el rellotge de la pàgina, i les diferències petites no es corregeixen movent la posició
 * sinó la velocitat (una mica més de pressa o a poc a poc fins que quadra), perquè la tira i el
 * cursor no facin salts. Les grans (un salt, una aturada per carregar) es prenen de cop.
 */

import type { PlaybackClock } from "./engine"
import { YT_STATE, type YTPlayer } from "./youtube"

export interface MediaClock extends PlaybackClock {
  play(): void
  pause(): void
  seek(ms: number): void
  setRate(rate: number): void
  destroy(): void
}

/** Diferència a partir de la qual una lectura es pren de cop. */
const HARD_SYNC_MS = 400
/** Temps en què s'absorbeix una diferència petita, i correcció màxima de la velocitat. */
const SLEW_MS = 1000
const MAX_SLEW = 0.08

/** Temps continu que segueix una lectura que avança a salts. */
class Smoother {
  private base = 0
  private baseWall = 0
  private lastRaw = NaN
  /** Correcció relativa de la velocitat mentre s'absorbeix una diferència. */
  private slew = 0

  /** La lectura següent es pren de cop (salt, canvi d'estat o de velocitat). */
  reset() {
    this.lastRaw = NaN
    this.slew = 0
  }

  read(raw: number, running: boolean, speed: number): number {
    const wall = performance.now()
    const est = running ? this.base + (wall - this.baseWall) * speed * (1 + this.slew) : this.base
    if (raw === this.lastRaw) return est
    const first = Number.isNaN(this.lastRaw)
    this.lastRaw = raw
    const err = raw - est
    this.baseWall = wall
    if (first || !running || Math.abs(err) > HARD_SYNC_MS) {
      this.base = raw
      this.slew = 0
    } else {
      this.base = est
      this.slew = Math.min(Math.max(err / (SLEW_MS * speed), -MAX_SLEW), MAX_SLEW)
    }
    return this.base
  }
}

export class AudioClock implements MediaClock {
  private pos = 0
  private anchorCtx = 0
  private running = false
  private speed = 1
  private smooth = new Smoother()

  constructor(
    private ctx: AudioContext,
    private duration: number,
    private onEnd: () => void,
  ) {}

  now(): number {
    if (!this.running) return this.pos
    const t = this.pos + (this.ctx.currentTime - this.anchorCtx) * 1000 * this.speed
    if (t >= this.duration) {
      this.pos = this.duration
      this.running = false
      this.onEnd()
      return this.duration
    }
    return t
  }

  /** Posició del que se sent ara (descomptada la latència de sortida), continua. */
  heardNow(): number {
    if (!this.running) return this.pos
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0
    const raw = this.pos + (this.ctx.currentTime - latency - this.anchorCtx) * 1000 * this.speed
    return Math.min(this.smooth.read(raw, true, this.speed), this.duration)
  }

  playing(): boolean {
    return this.running
  }

  rate(): number {
    return this.speed
  }

  /** Arrenca d'aquí a `delay` segons (compte enrere): fins llavors, `now()` és anterior a la posició. */
  play(delay = 0) {
    if (this.running) return
    this.anchorCtx = this.ctx.currentTime + delay
    this.running = true
    this.smooth.reset()
  }

  pause() {
    if (!this.running) return
    this.pos = Math.max(this.now(), this.pos)
    this.running = false
  }

  seek(ms: number) {
    this.pos = Math.min(Math.max(ms, 0), this.duration)
    this.anchorCtx = this.ctx.currentTime
    this.smooth.reset()
  }

  setRate(rate: number) {
    if (this.running) {
      this.pos = this.now()
      this.anchorCtx = this.ctx.currentTime
    }
    this.speed = rate
    this.smooth.reset()
  }

  destroy() {
    this.running = false
  }
}

export class YouTubeClock implements MediaClock {
  private state: number = YT_STATE.CUED
  private speed = 1
  private last = 0
  private smooth = new Smoother()

  constructor(private player: YTPlayer) {
    this.speed = player.getPlaybackRate() || 1
  }

  setState(state: number) {
    this.state = state
    this.smooth.reset()
  }

  setSpeed(rate: number) {
    this.speed = rate
    this.smooth.reset()
  }

  now(): number {
    try {
      this.last = this.smooth.read(this.player.getCurrentTime() * 1000, this.playing(), this.speed)
    } catch {
      // l'iframe encara no respon: l'última posició
    }
    return this.last
  }

  playing(): boolean {
    return this.state === YT_STATE.PLAYING
  }

  rate(): number {
    return this.speed
  }

  play() {
    this.player.playVideo()
  }

  pause() {
    this.player.pauseVideo()
  }

  seek(ms: number) {
    this.player.seekTo(Math.max(ms, 0) / 1000, true)
    this.last = ms
    this.smooth.reset()
  }

  setRate(rate: number) {
    this.player.setPlaybackRate(rate)
  }

  destroy() {
    // El reproductor el destrueix qui l'ha creat
  }
}
