/**
 * src/lib/player/synth.ts — Sons de l'acompanyament, sintetitzats al navegador.
 *
 * La guitarra i el baix són Karplus-Strong (corda pinçada: soroll que circula per una línia de
 * retard amb un filtre que l'apaga), amb un passatot per afinar el retard fraccionari i un pinte
 * de posició de la pua. Bombo, caixó, shaker, apagat i clic són síntesi directa. Cada so es
 * calcula un sol cop (mostra a mostra, en JS) i es desa com a AudioBuffer: tocar-lo després només
 * és un AudioBufferSourceNode. Cap mostra gravada ni cap llicència.
 */

import type { Sound } from "./arrange"

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** Generador pseudoaleatori amb llavor: el mateix so cada vegada. */
function noise(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 2147483648 - 1
  }
}

interface PluckParams {
  /** 0 = pua brillant, 1 = dit molt suau (filtre de l'excitació). */
  softness: number
  /** Segons fins a -60 dB per a una corda de 82 Hz (les agudes s'apaguen abans). */
  t60: number
  /** Posició de la pua (fracció de corda): aprima els harmònics corresponents. */
  pickPos: number
  /** Durada màxima del so, en segons. */
  maxLen: number
}

/** Karplus-Strong ampliat. */
function renderPluck(sr: number, midi: number, p: PluckParams, seed: number): Float32Array {
  const f = hz(midi)
  const period = sr / f
  // Retard total = L (línia) + 0,5 (filtre de mitjana) + d (passatot)
  let L = Math.floor(period - 0.5)
  let d = period - 0.5 - L
  if (d < 0.1) {
    L -= 1
    d += 1
  }
  const C = (1 - d) / (1 + d)
  const t60 = p.t60 * Math.pow(82 / f, 0.35)
  const loopGain = Math.pow(10, -3 / (t60 * f))
  const len = Math.floor(Math.min(t60, p.maxLen) * sr)
  const out = new Float32Array(len)

  // Excitació: soroll filtrat (passabaix d'un pol) amb el pinte de la posició de la pua
  const rnd = noise(seed)
  const exc = new Float32Array(L)
  let lp = 0
  const a = 0.1 + 0.8 * p.softness
  for (let i = 0; i < L; i++) {
    lp = (1 - a) * rnd() + a * lp
    exc[i] = lp
  }
  const pick = Math.max(1, Math.round(L * p.pickPos))
  for (let i = L - 1; i >= pick; i--) exc[i] -= exc[i - pick]
  let peak = 0
  for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(exc[i]))
  if (peak > 0) for (let i = 0; i < L; i++) exc[i] /= peak

  const buf = new Float32Array(L)
  buf.set(exc)
  let idx = 0
  let prev = 0 // per al filtre de mitjana
  let apX = 0 // passatot: entrada i sortida anteriors
  let apY = 0
  for (let n = 0; n < len; n++) {
    const x = buf[idx]
    const avg = 0.5 * (x + prev)
    prev = x
    const y = C * avg + apX - C * apY
    apX = avg
    apY = y
    const v = y * loopGain
    buf[idx] = v
    out[n] = x
    idx = idx + 1 === L ? 0 : idx + 1
  }
  fadeOut(out, sr, 0.03)
  // Atac de 2 ms: sense clic
  const attack = Math.floor(0.002 * sr)
  for (let i = 0; i < attack && i < len; i++) out[i] *= i / attack
  return out
}

function fadeOut(out: Float32Array, sr: number, seconds: number) {
  const n = Math.min(Math.floor(seconds * sr), out.length)
  for (let i = 0; i < n; i++) out[out.length - 1 - i] *= i / n
}

function renderKick(sr: number): Float32Array {
  const len = Math.floor(0.4 * sr)
  const out = new Float32Array(len)
  let phase = 0
  for (let n = 0; n < len; n++) {
    const t = n / sr
    const f = 45 + 75 * Math.exp(-t / 0.035)
    phase += (2 * Math.PI * f) / sr
    out[n] = Math.sin(phase) * Math.exp(-t / 0.12)
  }
  return out
}

/** Caixó: cop greu del cos i esclafit de soroll. */
function renderSnare(sr: number): Float32Array {
  const len = Math.floor(0.25 * sr)
  const out = new Float32Array(len)
  const rnd = noise(7)
  let hp = 0
  let lastN = 0
  for (let n = 0; n < len; n++) {
    const t = n / sr
    const w = rnd()
    hp = 0.6 * (hp + w - lastN) // passaalt d'un pol
    lastN = w
    const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.045)
    out[n] = 0.55 * body + 0.6 * hp * Math.exp(-t / 0.06)
  }
  return out
}

function renderShaker(sr: number): Float32Array {
  const len = Math.floor(0.12 * sr)
  const out = new Float32Array(len)
  const rnd = noise(11)
  let lastN = 0
  for (let n = 0; n < len; n++) {
    const t = n / sr
    const w = rnd()
    const hp = w - lastN
    lastN = w
    const env = t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.03)
    out[n] = 0.5 * hp * env
  }
  return out
}

/** Cop apagat de la mà sobre les cordes (chuck). */
function renderMute(sr: number): Float32Array {
  const len = Math.floor(0.09 * sr)
  const out = new Float32Array(len)
  const rnd = noise(5)
  let lp = 0
  for (let n = 0; n < len; n++) {
    const t = n / sr
    lp = 0.75 * lp + 0.25 * rnd()
    out[n] = (1.4 * lp + 0.5 * Math.sin(2 * Math.PI * 110 * t)) * Math.exp(-t / 0.018)
  }
  return out
}

function renderClick(sr: number, freq: number): Float32Array {
  const len = Math.floor(0.06 * sr)
  const out = new Float32Array(len)
  for (let n = 0; n < len; n++) {
    const t = n / sr
    out[n] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / 0.012)
  }
  return out
}

const GUITAR_BRIGHT: PluckParams = { softness: 0.05, t60: 3.2, pickPos: 0.13, maxLen: 3 }
const GUITAR_SOFT: PluckParams = { softness: 0.45, t60: 3.6, pickPos: 0.2, maxLen: 3 }
const BASS: PluckParams = { softness: 0.8, t60: 2.4, pickPos: 0.25, maxLen: 2.2 }

/** Banc de sons d'un AudioContext: cada so es calcula el primer cop que es demana. */
export class SoundBank {
  private cache = new Map<string, AudioBuffer>()

  constructor(private ctx: BaseAudioContext) {}

  private make(key: string, render: () => Float32Array): AudioBuffer {
    const hit = this.cache.get(key)
    if (hit) return hit
    const data = render()
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate)
    buffer.getChannelData(0).set(data)
    this.cache.set(key, buffer)
    return buffer
  }

  get(sound: Sound, midi: number, bright: boolean): AudioBuffer {
    const sr = this.ctx.sampleRate
    switch (sound) {
      case "pluck":
        return this.make(`p${midi}${bright ? "b" : "s"}`, () =>
          renderPluck(sr, midi, bright ? GUITAR_BRIGHT : GUITAR_SOFT, midi * 31 + (bright ? 1 : 2)),
        )
      case "bass":
        return this.make(`b${midi}`, () => renderPluck(sr, midi, BASS, midi * 17))
      case "kick":
        return this.make("kick", () => renderKick(sr))
      case "snare":
        return this.make("snare", () => renderSnare(sr))
      case "shaker":
        return this.make("shaker", () => renderShaker(sr))
      case "mute":
        return this.make("mute", () => renderMute(sr))
      case "click":
        return this.make("click", () => renderClick(sr, 1100))
      case "clickStrong":
        return this.make("clickStrong", () => renderClick(sr, 1760))
    }
  }

  /** Calcula per endavant els sons d'una llista de notes (en canviar d'estil o de to). */
  prepare(notes: Iterable<{ sound: Sound; midi: number; bright: boolean }>) {
    const seen = new Set<string>()
    for (const n of notes) {
      const key = `${n.sound}${n.midi}${n.bright}`
      if (seen.has(key)) continue
      seen.add(key)
      this.get(n.sound, n.midi, n.bright)
    }
  }
}

/** Resposta d'impuls d'una sala petita (soroll estèreo que s'apaga), per a una mica de reverb. */
export function roomImpulse(ctx: BaseAudioContext, seconds = 1.1): AudioBuffer {
  const len = Math.floor(seconds * ctx.sampleRate)
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    const rnd = noise(ch + 101)
    let lp = 0
    for (let n = 0; n < len; n++) {
      const t = n / ctx.sampleRate
      lp = 0.55 * lp + 0.45 * rnd()
      data[n] = lp * Math.exp(-t / 0.28)
    }
  }
  return buffer
}
