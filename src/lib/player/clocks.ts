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

/** Marge abans del final d'un segment en què es fa el salt (el seekTo de YouTube no és instantani). */
const PLAN_LEAD_MS = 40
/** Temps durant el qual, després d'un salt, s'ignoren lectures velles del vídeo. */
const PLAN_SEEK_SETTLE_MS = 1200

/**
 * Arranjament ràpid en mode vídeo (§22): el vídeo va en temps de l'original, i aquest rellotge el
 * passa a temps virtual (els segments del pla encadenats). En arribar al final d'un segment fa
 * saltar el vídeo a l'inici del següent; al final de l'últim, l'atura.
 */
export class PlanClock implements MediaClock {
  private seg = 0
  private last = 0
  /** Fins quan (performance.now) s'espera que el vídeo hagi fet el salt. */
  private settleUntil = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private inner: MediaClock,
    private plan: PlaybackPlanLike,
    private onEnd: () => void,
  ) {
    // Els salts no poden dependre dels frames (amb la pestanya amagada no n'hi ha)
    this.timer = setInterval(() => {
      if (this.inner.playing()) this.now()
    }, 50)
  }

  now(): number {
    const segs = this.plan.segments
    const s = segs[this.seg]
    if (!s) return this.last
    const t = this.inner.now()
    const inside = t >= s.from - 250 && t < s.to + 250
    if (!inside) {
      // Lectura d'abans del salt: es manté la posició
      if (performance.now() < this.settleUntil) return this.last
      // El vídeo és en un altre lloc (p. ex. l'usuari l'ha mogut): el segment que hi toqui
      let i = -1
      for (let k = this.seg; k < segs.length && i < 0; k++) if (t >= segs[k].from && t < segs[k].to) i = k
      for (let k = 0; k < segs.length && i < 0; k++) if (t >= segs[k].from && t < segs[k].to) i = k
      if (i < 0) {
        // En un tros tallat: al segment següent
        const next = segs.findIndex((x) => x.from > t)
        if (next < 0) return this.finish()
        this.jump(next)
        return this.last
      }
      this.seg = i
    }
    const cur = segs[this.seg]
    if (this.inner.playing() && t >= cur.to - PLAN_LEAD_MS) {
      const next = segs[this.seg + 1]
      if (!next) return this.finish()
      if (next.from === cur.to) this.seg++ // seguit a l'original: no cal saltar
      else this.jump(this.seg + 1)
      return this.last
    }
    this.last = cur.at + Math.min(Math.max(t - cur.from, 0), cur.to - cur.from)
    return this.last
  }

  private jump(i: number) {
    const s = this.plan.segments[i]
    this.seg = i
    this.inner.seek(s.from)
    this.last = s.at
    this.settleUntil = performance.now() + PLAN_SEEK_SETTLE_MS
  }

  private finish(): number {
    this.inner.pause()
    this.seg = Math.max(this.plan.segments.length - 1, 0)
    this.last = this.plan.duration
    this.onEnd()
    return this.last
  }

  playing(): boolean {
    return this.inner.playing()
  }

  rate(): number {
    return this.inner.rate()
  }

  play() {
    if (this.last >= this.plan.duration - 300) this.seek(0)
    this.inner.play()
  }

  pause() {
    this.inner.pause()
  }

  seek(ms: number) {
    const segs = this.plan.segments
    if (!segs.length) return
    let i = segs.length - 1
    for (let k = 0; k < segs.length; k++) {
      if (ms < segs[k].at + (segs[k].to - segs[k].from)) {
        i = k
        break
      }
    }
    const s = segs[i]
    const off = Math.min(Math.max(ms - s.at, 0), s.to - s.from)
    this.seg = i
    this.inner.seek(s.from + off)
    this.last = s.at + off
    this.settleUntil = performance.now() + PLAN_SEEK_SETTLE_MS
  }

  setRate(rate: number) {
    this.inner.setRate(rate)
  }

  destroy() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

/** El que PlanClock necessita del pla (src/lib/arrangement/plan.ts), sense importar-lo. */
export interface PlaybackPlanLike {
  segments: { from: number; to: number; at: number }[]
  duration: number
}
