/**
 * src/lib/player/timeline.ts — Cronologia de la reproducció a partir de l'anàlisi i la sincronització.
 *
 * - Graella: els temps (`beats`) de l'anàlisi, amb el compàs que donen els `downbeats`. La
 *   pulsació és el temps que se sent: en 6/8 (i 9/8, 12/8) el transcriptor dona corxeres, i
 *   cada pulsació n'agrupa tres.
 * - Acords: els del content (els que veu l'usuari) amb el temps de `syncAnalysis`. Als trams
 *   llargs sense cap acord escrit (intros, solos o finals que el content no porta), els de
 *   l'anàlisi passats al to del content. Als silencis de l'anàlisi (una aturada), cap acord.
 *
 * Tots els temps en ms de l'àudio original. Els acords van en el to del content: qui toca els
 * transposa (en el to del vídeo, + `transpose`; en el de la vista, + els semitons de l'usuari).
 * Pur.
 */

import type { AnalysisCompact } from "../schemas/transcriber"
import type { SyncOccurrence, SyncResult, SyncSection } from "../transcriber/sync"
import { transposeChord } from "../transpose"
import { chordClass, sameClass } from "../transcriber/syncText"

export interface Beat {
  t: number
  downbeat: boolean
}

export interface Pulse {
  t: number
  /** Durada fins a la pulsació següent. */
  dur: number
  /** Número de compàs (0 = anacrusi). */
  bar: number
  /** Posició dins el compàs, en pulsacions (0 = primera). */
  inBar: number
  /** Pulsacions d'aquest compàs. */
  perBar: number
}

export interface TimedChord {
  t: number
  /** En el to del content; null = no sona res. */
  label: string | null
  source: "content" | "analysis"
  /** Per als del content: ocurrència (índex a `occurrences`), span <ch> i posició a la cadena. */
  occ: number
  span: number
  sub: number
}

export interface Timeline {
  duration: number
  beats: Beat[]
  pulses: Pulse[]
  compound: boolean
  /** Pulsacions per compàs nominals (del compàs de l'anàlisi). */
  pulsesPerBar: number
  /** Tempo de la pulsació (pulsacions per minut). */
  bpm: number
  /** Durada mediana d'un compàs. */
  barMs: number
  chords: TimedChord[]
  occurrences: SyncOccurrence[]
  sections: SyncSection[]
  /** Primer acord que sona (on comença l'acompanyament). */
  firstChordT: number
  /** Semitons content → àudio. */
  transpose: number
}

/** Mínim de compassos sense acords escrits per omplir-los amb els de l'anàlisi. */
const FILL_MIN_BARS = 2
/** Un buit de l'anàlisi sense acords d'almenys aquests compassos és una aturada. */
const SILENCE_MIN_BARS = 1

function median(xs: number[], fallback: number): number {
  if (xs.length === 0) return fallback
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function isCompound(timeSignature: readonly [number, number] | null | undefined): boolean {
  if (!timeSignature) return false
  const [n, d] = timeSignature
  return d === 8 && n >= 6 && n % 3 === 0
}

/** Temps i pulsacions de l'anàlisi. */
export function buildGrid(analysis: AnalysisCompact): {
  beats: Beat[]
  pulses: Pulse[]
  compound: boolean
  pulsesPerBar: number
  ibi: number
} {
  const ts = analysis.tempo?.time_signature ?? [4, 4]
  const compound = isCompound(ts)
  const group = compound ? 3 : 1
  const nominal = ts[0]

  const times: number[] = []
  let acc = 0
  for (const dt of analysis.beats.dt) {
    acc += dt
    times.push(acc)
  }
  const down = new Set(analysis.beats.downbeats)
  const beats: Beat[] = times.map((t, i) => ({ t, downbeat: down.has(i) }))
  const ibi = median(times.slice(1).map((t, i) => t - times[i]), 500)

  // Posició de cada temps dins el seu compàs, i temps de cada compàs
  const downs = [...down].filter((i) => i < times.length).sort((a, b) => a - b)
  if (downs.length === 0) for (let i = 0; i < times.length; i += nominal) downs.push(i)
  const first = downs[0] ?? 0
  const pulses: Pulse[] = []
  let bar = 0
  let d = 0 // índex a downs del compàs actual
  for (let i = 0; i < times.length; i++) {
    let inBeat: number
    let barBeats: number
    if (i < first) {
      // Anacrusi: es compta enrere des del final d'un compàs nominal
      inBeat = Math.max(nominal - (first - i), 0)
      barBeats = nominal
      bar = 0
    } else {
      while (d + 1 < downs.length && downs[d + 1] <= i) d++
      inBeat = i - downs[d]
      barBeats = d + 1 < downs.length ? downs[d + 1] - downs[d] : nominal
      bar = d + 1
    }
    if (inBeat % group !== 0) continue
    pulses.push({
      t: times[i],
      dur: 0,
      bar,
      inBar: inBeat / group,
      perBar: Math.max(Math.ceil(barBeats / group), 1),
    })
  }
  const pulseMs = median(pulses.slice(1).map((p, k) => p.t - pulses[k].t), ibi * group)
  pulses.forEach((p, k) => {
    p.dur = k + 1 < pulses.length ? pulses[k + 1].t - p.t : pulseMs
  })
  return { beats, pulses, compound, pulsesPerBar: Math.max(Math.round(nominal / group), 1), ibi }
}

export function buildTimeline(analysis: AnalysisCompact, sync: SyncResult): Timeline {
  const { beats, pulses, compound, pulsesPerBar, ibi } = buildGrid(analysis)
  const duration = Math.round(analysis.source.duration_s * 1000)
  const beatsPerBar = analysis.tempo?.time_signature[0] ?? 4
  const barMs = ibi * beatsPerBar
  const pulseMs = median(pulses.map((p) => p.dur), ibi)

  // Acords del content
  const occurrences = [...sync.occurrences].sort((a, b) => a.start - b.start)
  const content: TimedChord[] = []
  occurrences.forEach((o, oi) => {
    for (const c of o.chords) {
      content.push({ t: c.t, label: c.label, source: "content", occ: oi, span: c.span, sub: c.sub })
    }
  })
  content.sort((a, b) => a.t - b.t)

  // Acords de l'anàlisi, en el to del content
  const heard = analysis.chords.map((c) => ({
    start: c[0],
    end: c[1],
    label: transposeChord(c[2], -sync.transpose),
  }))

  // Trams llargs sense acords escrits → els de l'anàlisi
  const chords: TimedChord[] = []
  const fill = (from: number, to: number, active: string | null) => {
    let current = active
    for (const h of heard) {
      if (h.start < from || h.start >= to) continue
      if (current && sameClass(chordClass(current), chordClass(h.label))) continue
      chords.push({ t: h.start, label: h.label, source: "analysis", occ: -1, span: -1, sub: 0 })
      current = h.label
    }
  }
  const fillGap = FILL_MIN_BARS * barMs
  if (content.length === 0) {
    fill(0, duration, null)
  } else {
    if (content[0].t > fillGap) fill(0, content[0].t - ibi / 2, null)
    content.forEach((c, k) => {
      chords.push(c)
      const next = k + 1 < content.length ? content[k + 1].t : duration
      if (next - c.t > fillGap) fill(c.t + ibi, next - ibi / 2, c.label)
    })
  }
  chords.sort((a, b) => a.t - b.t)

  // Aturades: buits de l'anàlisi sense cap acord
  const silenceMin = SILENCE_MIN_BARS * barMs
  const gaps: [number, number][] = []
  heard.forEach((h, k) => {
    const next = k + 1 < heard.length ? heard[k + 1].start : null
    if (next !== null && next - h.end >= silenceMin) gaps.push([h.end, next])
  })
  const lastHeard = heard.length ? heard[heard.length - 1].end : duration
  const withSilences: TimedChord[] = []
  let gi = 0
  let active: TimedChord | null = null
  const silence = (t: number): TimedChord => ({ t, label: null, source: "analysis", occ: -1, span: -1, sub: 0 })
  /** Aturades d'abans de `until`: s'apaga i, si l'acord no canvia, torna a sonar el mateix. */
  const silencesBefore = (until: number) => {
    while (gi < gaps.length && gaps[gi][0] < until) {
      const [a, b] = gaps[gi]
      withSilences.push(silence(a))
      if (b < until && active) withSilences.push({ ...active, t: b })
      gi++
    }
  }
  for (const c of chords) {
    silencesBefore(c.t)
    withSilences.push(c)
    active = c
  }
  if (chords.length) {
    const end = Math.max(lastHeard, chords[chords.length - 1].t + pulseMs)
    silencesBefore(end)
    withSilences.push(silence(end))
  }

  const firstChord = withSilences.find((c) => c.label !== null)
  return {
    duration,
    beats,
    pulses,
    compound,
    pulsesPerBar,
    bpm: Math.round(60000 / Math.max(pulseMs, 1)),
    barMs,
    chords: withSilences,
    occurrences,
    sections: [...sync.sections].sort((a, b) => a.start - b.start),
    firstChordT: firstChord ? firstChord.t : 0,
    transpose: sync.transpose,
  }
}

/** Índex de l'últim element amb `t <= x` (o -1). */
export function indexAt<T extends { t: number }>(items: readonly T[], x: number): number {
  let lo = 0
  let hi = items.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].t <= x) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Ocurrència (línia) que sona a `x`: la que ha començat més tard sense acabar-se; si no, -1. */
export function occurrenceAt(occurrences: readonly SyncOccurrence[], x: number): number {
  let best = -1
  for (let i = 0; i < occurrences.length; i++) {
    const o = occurrences[i]
    if (o.start > x) break
    if (x < o.end + 400) best = i
  }
  return best
}

/** Inici del compàs on cau `x` (per començar a tocar a l'inici d'un compàs). */
export function barStartAt(tl: Timeline, x: number): number {
  const k = indexAt(tl.pulses, x)
  if (k < 0) return tl.pulses.length ? tl.pulses[0].t : 0
  let j = k
  while (j > 0 && tl.pulses[j].inBar > 0) j--
  return tl.pulses[j].t
}
