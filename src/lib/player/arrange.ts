/**
 * src/lib/player/arrange.ts — Cronologia + estil → notes a tocar.
 *
 * El patró de l'estil es reparteix sobre les pulsacions reals (cada franja s'interpola dins la
 * seva pulsació) i es reinicia a cada compàs. Els canvis d'acord es quantitzen a la franja més
 * propera; si hi cau una franja buida, s'hi toca la fitxa de farciment de l'estil. Amb l'empremta
 * de groove de l'anàlisi, la intensitat de cada franja es barreja amb l'accent mesurat.
 *
 * La guitarra és monofònica per corda: una nota nova a una corda talla l'anterior, i canviar
 * d'acord apaga les cordes que no es tornen a tocar. Pur (aleatorietat amb llavor fixa).
 */

import { transposeChord } from "../transpose"
import { STYLES, tokens, type StyleId, type Token } from "./styles"
import type { Pulse, Timeline, TimedChord } from "./timeline"
import { bassMidi, lowStrings, topStrings, voicingFor, type Voicing } from "./voicings"

export type Track = "guitar" | "bass" | "perc" | "click"
export type Sound = "pluck" | "mute" | "bass" | "kick" | "snare" | "shaker" | "click" | "clickStrong"

export interface NoteEvent {
  /** ms de l'àudio original. */
  t: number
  track: Track
  sound: Sound
  midi: number
  vel: number
  /** ms que sona abans d'apagar-la (la cua natural pot ser més curta). */
  dur: number
  /** Atac brillant (pua, rasgueig) o suau (dits). */
  bright: boolean
}

/** Empremta de groove del transcriptor: una fila de compàs per banda, valors 0-1. */
export interface Groove {
  slots_per_beat: number
  low: number[]
  mid: number[]
  high: number[]
}

export interface ArrangeOptions {
  style: StyleId
  /** Semitons que se sumen als acords de la cronologia (to del content) per fer-los sonar. */
  pitchShift: number
  groove?: Groove | null
}

/** Fitxes que un canvi d'acord substitueix pel farciment de l'estil. */
const FILLABLE = new Set([".", "_", "1", "2", "3", "T"])

const RING_MS = 2600
const BASS_RING_MS = 1800
const DAMP_MS = 25

const BASE_VEL: Record<string, number> = {
  D: 0.82, d: 0.58, U: 0.62, u: 0.45, P: 0.85, p: 0.6, S: 0.7, s: 0.55, X: 0.7,
  B: 0.78, A: 0.68, "1": 0.55, "2": 0.55, "3": 0.58, T: 0.6, C: 0.72,
  R: 0.85, F: 0.75, O: 0.72,
  k: 0.9, s_: 0.75, h: 0.35, H: 0.55,
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Slot {
  t: number
  dur: number
  pulse: Pulse
  /** Índex de la fitxa dins el patró. */
  idx: number
  /** Posició dins el compàs, 0-1 (per a l'empremta de groove). */
  frac: number
}

function slotsOf(pulses: Pulse[], cycle: number, sub: number): Slot[] {
  const slots: Slot[] = []
  for (const p of pulses) {
    const pos = p.inBar % cycle
    for (let k = 0; k < sub; k++) {
      slots.push({
        t: p.t + (p.dur * k) / sub,
        dur: p.dur / sub,
        pulse: p,
        idx: pos * sub + k,
        frac: (p.inBar + k / sub) / Math.max(p.perBar, 1),
      })
    }
  }
  return slots
}

export function arrange(tl: Timeline, opts: ArrangeOptions): NoteEvent[] {
  const style = STYLES[opts.style]
  const rand = mulberry32(0x5eed)
  const jitter = (ms: number) => (rand() - 0.5) * 2 * ms
  const events: NoteEvent[] = []
  const sounding = (c: TimedChord | null) => (c?.label ? transposeChord(c.label, opts.pitchShift) : null)

  // Cordes de la guitarra: l'última nota de cada una (per tallar-la) i el baix
  const lastOnString: (NoteEvent | null)[] = [null, null, null, null, null, null]
  let lastBass: NoteEvent | null = null
  const cut = (ev: NoteEvent | null, t: number) => {
    if (ev && ev.t + ev.dur > t) ev.dur = Math.max(t - ev.t, DAMP_MS)
  }
  const dampAll = (t: number) => {
    lastOnString.forEach((ev) => cut(ev, t))
  }
  const pluck = (t: number, string: number, midi: number, vel: number, bright: boolean, dur = RING_MS, sound: Sound = "pluck") => {
    cut(lastOnString[string], t)
    const ev: NoteEvent = { t, track: "guitar", sound, midi, vel: Math.min(vel, 1), dur, bright }
    events.push(ev)
    lastOnString[string] = ev
  }
  const bassNote = (t: number, midi: number, vel: number, dur = BASS_RING_MS) => {
    cut(lastBass, t)
    const ev: NoteEvent = { t, track: "bass", sound: "bass", midi, vel, dur, bright: false }
    events.push(ev)
    lastBass = ev
  }

  /** Rasgueig: `strings` de greu a aguda; avall les toca en aquest ordre, amunt al revés. */
  const strum = (t: number, v: Voicing, strings: number[], up: boolean, vel: number, slotDur: number, short: boolean) => {
    const order = up ? [...strings].reverse() : strings
    const spread = Math.min(up ? 9 : 12, slotDur * 0.12)
    const dur = short ? Math.max(slotDur * 0.55, 60) : RING_MS
    order.forEach((s, k) => {
      const midi = v.strings[s]
      if (midi === null) return
      // Les primeres cordes que toca la pua sonen una mica més fort
      pluck(t + k * spread, s, midi, vel * (1 - k * 0.04), true, dur)
    })
  }

  const playGuitar = (tok: Token, t: number, v: Voicing, slotDur: number, accent: number) => {
    const vel = (BASE_VEL[tok.sym] ?? 0.6) * accent * (tok.accent ? 1.15 : 1)
    switch (tok.sym) {
      case "D": return strum(t, v, lowStrings(v, 6), false, vel, slotDur, false)
      case "d": return strum(t, v, topStrings(v, 4), false, vel, slotDur, false)
      case "U": return strum(t, v, topStrings(v, 4), true, vel, slotDur, false)
      case "u": return strum(t, v, topStrings(v, 3), true, vel, slotDur, false)
      case "P": return strum(t, v, lowStrings(v, 3), false, vel, slotDur, true)
      case "p": return strum(t, v, lowStrings(v, 3), false, vel, slotDur, true)
      case "S": return strum(t, v, topStrings(v, 4), false, vel, slotDur, true)
      case "s": return strum(t, v, topStrings(v, 4), true, vel, slotDur, true)
      case "X": {
        dampAll(t)
        events.push({ t, track: "guitar", sound: "mute", midi: 0, vel, dur: 60, bright: true })
        return
      }
      case "B": case "A": {
        const s = tok.sym === "B" ? v.root : v.alt
        const midi = v.strings[s]
        if (midi !== null) pluck(t, s, midi, vel, false)
        return
      }
      case "1": case "2": case "3": {
        const top = topStrings(v, 3)
        const s = top[Number(tok.sym) - 1 - (3 - top.length)]
        const midi = s === undefined ? null : v.strings[s]
        if (s !== undefined && midi !== null) pluck(t, s, midi, vel, false)
        return
      }
      case "T": case "C": {
        const strings = tok.sym === "C" ? [v.root, ...topStrings(v, 3)] : topStrings(v, 3)
        for (const s of strings) {
          const midi = v.strings[s]
          if (midi !== null) pluck(t + jitter(3), s, midi, vel, false)
        }
        return
      }
      case "_": return dampAll(t)
    }
  }

  const playBass = (sym: string, t: number, v: Voicing, accent: number) => {
    const vel = (BASE_VEL[sym] ?? 0.8) * accent
    if (sym === "R") bassNote(t, bassMidi(v.bassPc), vel)
    else if (sym === "F") bassNote(t, bassMidi(v.bassPc, 7), vel)
    else if (sym === "O") bassNote(t, bassMidi(v.bassPc) + 12, vel)
    else if (sym === "_") cut(lastBass, t)
  }

  const playPerc = (sym: string, t: number, accent: number) => {
    const sound: Sound | null = sym === "k" ? "kick" : sym === "s" ? "snare" : sym === "h" || sym === "H" ? "shaker" : null
    if (!sound) return
    const vel = (BASE_VEL[sym === "s" ? "s_" : sym] ?? 0.5) * accent
    events.push({ t, track: "perc", sound, midi: 0, vel, dur: 200, bright: false })
  }

  // ── Estil lliure: un rasgueig a cada canvi d'acord ──
  if (style.feel === "free") {
    let prev: string | null = null
    for (const c of tl.chords) {
      const label = sounding(c)
      if (label === prev) continue
      prev = label
      if (!label) {
        dampAll(c.t)
        cut(lastBass, c.t)
        continue
      }
      const v = voicingFor(label)
      if (!v) continue
      dampAll(c.t)
      const strings = lowStrings(v, 6)
      strings.forEach((s, k) => {
        const midi = v.strings[s]
        if (midi !== null) pluck(c.t + k * 30, s, midi, 0.72, true, 6000)
      })
      bassNote(c.t, bassMidi(v.bassPc), 0.7, 6000)
    }
    addClicks(tl, events)
    return events.sort((a, b) => a.t - b.t)
  }

  // ── Estils amb patró ──
  const guitar = tokens(style.guitar)
  const bass = tokens(style.bass)
  const perc = tokens(style.perc)
  const slots = slotsOf(tl.pulses, style.pulses, style.sub)
  if (slots.length === 0) return events

  // Canvis d'acord quantitzats a la franja més propera
  const changeAt = new Map<number, TimedChord>()
  let s = 0
  for (const c of tl.chords) {
    while (s + 1 < slots.length && Math.abs(slots[s + 1].t - c.t) <= Math.abs(slots[s].t - c.t)) s++
    // Dos canvis a la mateixa franja: es queda l'últim
    changeAt.set(s, c)
  }
  // Abans de la primera franja amb acord, res
  const grooveRow = opts.groove?.mid?.length ? opts.groove.mid : null

  let current: TimedChord | null = null
  let prevLabel: string | null = null
  slots.forEach((slot, si) => {
    const change = changeAt.get(si)
    if (change) current = change
    const label = sounding(current)
    const isChange = label !== prevLabel
    if (isChange && label === null) {
      dampAll(slot.t)
      cut(lastBass, slot.t)
    }
    prevLabel = label
    if (!label) return
    const v = voicingFor(label)
    if (!v) return
    if (isChange) dampAll(slot.t)

    let accent = 1
    if (grooveRow) {
      const gi = Math.round(slot.frac * grooveRow.length) % grooveRow.length
      accent = 0.6 + 0.4 * Math.min(Math.max(grooveRow[gi] ?? 0, 0), 1)
    }
    accent *= 0.94 + rand() * 0.12
    const t = slot.t + jitter(4)

    let g = guitar[slot.idx % guitar.length]
    // Un canvi en una franja buida (o a mig arpegi) es marca amb el farciment: rasgueig o polze
    if (isChange && FILLABLE.has(g.sym)) g = { sym: style.fill, accent: false }
    if (g.sym !== ".") playGuitar(g, t, v, slot.dur, accent)

    let b = bass[slot.idx % bass.length]
    if (isChange && b.sym === ".") b = { sym: "R", accent: false }
    if (b.sym !== ".") playBass(b.sym, slot.t, v, accent)

    const p = perc[slot.idx % perc.length]
    if (p.sym !== ".") playPerc(p.sym, slot.t, accent)
  })

  addClicks(tl, events)
  return events.sort((a, b) => a.t - b.t)
}

/** Clic a cada temps (la pista de clic es pot apagar a la mescla). */
function addClicks(tl: Timeline, events: NoteEvent[]) {
  for (const b of tl.beats) {
    events.push({
      t: b.t,
      track: "click",
      sound: b.downbeat ? "clickStrong" : "click",
      midi: 0,
      vel: b.downbeat ? 1 : 0.6,
      dur: 60,
      bright: false,
    })
  }
}
