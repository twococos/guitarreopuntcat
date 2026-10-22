/**
 * src/lib/player/engine.ts — Planificador de l'acompanyament sobre WebAudio.
 *
 * Cada 25 ms mira on és el rellotge de la reproducció (el vídeo o el propi AudioContext) i
 * programa a l'AudioContext les notes dels pròxims ~150 ms ("A tale of two clocks"). Si el
 * rellotge salta (l'usuari mou la posició, el vídeo s'atura a carregar), apaga el que hi havia
 * programat i torna a començar des de la posició nova. Les notes són a ms de l'àudio original:
 * la velocitat de reproducció les escurça.
 */

import type { NoteEvent, Track } from "./arrange"
import { SoundBank, roomImpulse } from "./synth"

export interface PlaybackClock {
  /** Posició actual, en ms de l'àudio original. */
  now(): number
  playing(): boolean
  rate(): number
}

export type MixLevels = Record<Track, number>

const TICK_MS = 25
const LOOKAHEAD_MS = 150
/** Diferència entre on hauria de ser el rellotge i on és que es considera un salt. */
const JUMP_MS = 180

/** Guany de cada pista a volum 1 (per equilibrar-les entre elles). */
const TRACK_GAIN: Record<Track, number> = { guitar: 0.32, bass: 0.55, perc: 0.5, click: 0.45 }

interface Voice {
  src: AudioBufferSourceNode
  gain: GainNode
}

function lowerBound(events: NoteEvent[], t: number): number {
  let lo = 0
  let hi = events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (events[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export class AccompanimentEngine {
  readonly bank: SoundBank
  private master: GainNode
  private buses: Record<Track, GainNode>
  private levels: MixLevels = { guitar: 1, bass: 0, perc: 0, click: 0 }
  private events: NoteEvent[] = []
  private idx = 0
  private voices = new Set<Voice>()
  private timer: ReturnType<typeof setInterval> | null = null
  private clock: PlaybackClock | null = null
  private wasPlaying = false
  private lastNow = 0
  private lastWall = 0
  private needReindex = true
  /** En arrencar des d'una posició concreta (compte enrere), no es toca res d'abans. */
  private from: number | null = null

  constructor(readonly ctx: AudioContext) {
    this.bank = new SoundBank(ctx)

    // Cadena: busos → (cos de la guitarra) → compressor suau → sortida; una mica de sala
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    comp.attack.value = 0.005
    comp.release.value = 0.15
    comp.connect(ctx.destination)
    this.master = ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(comp)

    const reverb = ctx.createConvolver()
    reverb.buffer = roomImpulse(ctx)
    const wet = ctx.createGain()
    wet.gain.value = 0.18
    reverb.connect(wet).connect(this.master)

    const bus = () => {
      const g = ctx.createGain()
      g.gain.value = 0
      return g
    }
    this.buses = { guitar: bus(), bass: bus(), perc: bus(), click: bus() }

    // Cos de la guitarra: greus de caixa, menys estridència
    const body = ctx.createBiquadFilter()
    body.type = "peaking"
    body.frequency.value = 120
    body.Q.value = 1.2
    body.gain.value = 4
    const air = ctx.createBiquadFilter()
    air.type = "highshelf"
    air.frequency.value = 5000
    air.gain.value = -5
    this.buses.guitar.connect(body).connect(air)
    air.connect(this.master)
    air.connect(reverb)

    const bassLp = ctx.createBiquadFilter()
    bassLp.type = "lowpass"
    bassLp.frequency.value = 900
    this.buses.bass.connect(bassLp).connect(this.master)
    this.buses.perc.connect(this.master)
    this.buses.perc.connect(reverb)
    this.buses.click.connect(this.master)
    this.applyLevels()
  }

  setEvents(events: NoteEvent[]) {
    this.events = events
    this.bank.prepare(events)
    this.stopAll()
    this.needReindex = true
  }

  setLevels(levels: MixLevels) {
    this.levels = { ...levels }
    this.applyLevels()
  }

  private applyLevels() {
    const now = this.ctx.currentTime
    for (const track of Object.keys(this.buses) as Track[]) {
      const v = this.levels[track] * TRACK_GAIN[track]
      this.buses[track].gain.setTargetAtTime(v, now, 0.03)
    }
  }

  attach(clock: PlaybackClock | null) {
    this.clock = clock
    this.stopAll()
    this.needReindex = true
    this.wasPlaying = false
    if (clock && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
    if (!clock && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Es tornarà a començar a programar des de `from` (o des d'on sigui el rellotge). */
  resync(from: number | null = null) {
    this.stopAll()
    this.needReindex = true
    this.from = from
  }

  /** Compte enrere: `count` clics separats `intervalMs` (ms de l'àudio) a partir d'ara. Retorna quant dura, en s. */
  countIn(count: number, intervalMs: number, rate: number): number {
    const start = this.ctx.currentTime + 0.05
    const step = intervalMs / 1000 / rate
    for (let k = 0; k < count; k++) {
      const strong = k === 0
      this.play(
        { t: 0, track: "click", sound: strong ? "clickStrong" : "click", midi: 0, vel: strong ? 1 : 0.65, dur: 60, bright: false },
        start + k * step,
        1,
        0.5,
      )
    }
    return 0.05 + count * step
  }

  private tick() {
    const clock = this.clock
    if (!clock) return
    if (this.ctx.state !== "running") return
    if (!clock.playing()) {
      if (this.wasPlaying) this.stopAll()
      this.wasPlaying = false
      return
    }
    const now = clock.now()
    const rate = clock.rate()
    const wall = performance.now()
    const expected = this.lastNow + (wall - this.lastWall) * rate
    if (!this.wasPlaying || this.needReindex || Math.abs(now - expected) > JUMP_MS) {
      this.stopAll()
      this.idx = lowerBound(this.events, Math.max(now, this.from ?? -Infinity))
      this.needReindex = false
      this.from = null
    }
    this.wasPlaying = true
    this.lastNow = now
    this.lastWall = wall

    const ctxNow = this.ctx.currentTime
    const horizon = now + LOOKAHEAD_MS * rate
    while (this.idx < this.events.length && this.events[this.idx].t < horizon) {
      const ev = this.events[this.idx++]
      if (this.levels[ev.track] <= 0) continue
      const when = ctxNow + (ev.t - now) / rate / 1000
      if (when < ctxNow - 0.01) continue
      this.play(ev, Math.max(when, ctxNow), rate)
    }
  }

  private play(ev: NoteEvent, when: number, rate: number, direct = 0) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.bank.get(ev.sound, ev.midi, ev.bright)
    const gain = this.ctx.createGain()
    const v = Math.pow(Math.min(Math.max(ev.vel, 0), 1.2), 1.4)
    gain.gain.value = direct > 0 ? v * direct : v
    src.connect(gain)
    gain.connect(direct > 0 ? this.master : this.buses[ev.track])
    const end = when + ev.dur / 1000 / rate
    gain.gain.setValueAtTime(gain.gain.value, end)
    gain.gain.setTargetAtTime(0, end, 0.02)
    src.start(when)
    src.stop(Math.min(end + 0.15, when + src.buffer.duration))
    const voice: Voice = { src, gain }
    this.voices.add(voice)
    src.onended = () => {
      this.voices.delete(voice)
      src.disconnect()
      gain.disconnect()
    }
  }

  /** Apaga (amb una fosa curta) tot el que sona i el que hi ha programat. */
  stopAll() {
    const now = this.ctx.currentTime
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now)
        v.gain.gain.setTargetAtTime(0, now, 0.012)
        v.src.stop(now + 0.06)
      } catch {
        // ja s'havia aturat
      }
    }
    this.voices.clear()
  }

  destroy() {
    this.attach(null)
    this.stopAll()
  }
}
