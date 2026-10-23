/**
 * src/lib/arrangement/plan.ts — Pla de reproducció d'un arranjament ràpid (§22).
 *
 * L'arranjament només canvia l'estructura, així que es pot tocar amb la sincronització de
 * l'original: cada ítem de la recepta és un tros de l'àudio original, i el pla és la llista de
 * trossos (segments) en l'ordre de l'arranjament.
 *
 * - Un ítem va de l'inici de la seva secció (a l'àudio) fins a l'inici de la secció següent, per
 *   incloure-hi els instrumentals d'entremig. Si la secció es repeteix seguida (x2, bis), l'ítem
 *   les inclou totes. El primer ítem, si és la primera secció de l'original, comença a 0 (intro).
 * - Els límits s'ajusten a l'inici del compàs: cada salt cau a la primera pulsació.
 * - Un vers esborrat sencer es talla (de l'inici del seu compàs al de la línia següent).
 *
 * `virtualizeTimeline` en fa una cronologia nova en «temps virtual» (els segments encadenats)
 * on les ocurrències i els acords apunten als blocs del content arranjat: el reproductor la fa
 * servir tal qual (acompanyament, tira de compassos, cos sincronitzat, seccions). En mode vídeo,
 * `PlanClock` (player/clocks.ts) tradueix el temps del vídeo i fa els salts.
 *
 * Pur.
 */

import type { SyncOccurrence, SyncSection } from "../transcriber/sync"
import { barStartAt, indexAt, type Beat, type Pulse, type TimedChord, type Timeline } from "../player/timeline"
import type { ArrangedContent } from "./apply"

export interface Segment {
  /** Índex de l'ítem a la recepta. */
  item: number
  /** Tros de l'original, en ms [from, to). */
  from: number
  to: number
  /** Inici del segment en temps virtual. */
  at: number
}

export interface PlaybackPlan {
  segments: Segment[]
  duration: number
  /** Ítems sense temps (la secció no s'ha pogut sincronitzar): no sonen. */
  unsynced: number[]
}

/** Temps virtual → segment i temps original. */
export function toOriginal(plan: PlaybackPlan, v: number): { seg: number; t: number } {
  const segs = plan.segments
  if (!segs.length) return { seg: -1, t: v }
  let seg = segs.length - 1
  for (let i = 0; i < segs.length; i++) {
    if (v < segs[i].at + (segs[i].to - segs[i].from)) {
      seg = i
      break
    }
  }
  const s = segs[seg]
  return { seg, t: s.from + Math.min(Math.max(v - s.at, 0), s.to - s.from) }
}

/** Segment que conté el temps original `t`: primer el `prefer`, després els següents, després tots. */
export function segmentAt(plan: PlaybackPlan, t: number, prefer = 0): number {
  const segs = plan.segments
  const inside = (i: number) => segs[i] && t >= segs[i].from && t < segs[i].to
  if (inside(prefer)) return prefer
  for (let i = prefer + 1; i < segs.length; i++) if (inside(i)) return i
  for (let i = 0; i < segs.length; i++) if (inside(i)) return i
  return -1
}

interface Range {
  from: number
  to: number
}

function subtract(range: Range, cuts: Range[]): Range[] {
  let parts: Range[] = [range]
  for (const c of cuts) {
    parts = parts.flatMap((p) => {
      if (c.to <= p.from || c.from >= p.to) return [p]
      const out: Range[] = []
      if (c.from > p.from) out.push({ from: p.from, to: c.from })
      if (c.to < p.to) out.push({ from: c.to, to: p.to })
      return out
    })
  }
  return parts.filter((p) => p.to - p.from > 50)
}

export function buildPlaybackPlan(tl: Timeline, arranged: ArrangedContent): PlaybackPlan {
  const snap = (t: number) => (tl.pulses.length ? barStartAt(tl, t) : t)
  const sections = [...tl.sections].sort((a, b) => a.start - b.start)
  const occs = tl.occurrences // ja en ordre de l'àudio
  const introOccs = occs.filter((o) => o.block < arranged.firstSec)
  const firstSoundStart = Math.min(sections[0]?.start ?? Infinity, introOccs[0]?.start ?? Infinity)

  const segments: Segment[] = []
  const unsynced: number[] = []
  let at = 0

  arranged.items.forEach((it, k) => {
    const item = arranged.itemIndex[k]
    let range: Range | null = null
    if (it.sec >= 0) {
      const i = sections.findIndex((s) => s.block === it.sec)
      if (i >= 0) {
        let j = i
        while (j + 1 < sections.length && sections[j + 1].block === it.sec) j++
        const next = sections[j + 1]
        range = { from: sections[i].start, to: next ? snap(next.start) : tl.duration }
      }
    } else if (introOccs.length) {
      const next = sections.find((s) => s.start > introOccs[0].start)
      range = { from: introOccs[0].start, to: next ? snap(next.start) : tl.duration }
    }
    if (!range) {
      unsynced.push(item)
      return
    }
    const isFirstSound = range.from <= firstSoundStart
    range.from = k === 0 && isFirstSound ? 0 : snap(range.from)
    if (range.to <= range.from) {
      unsynced.push(item)
      return
    }

    // Versos esborrats sencers: es tallen
    const cuts: Range[] = []
    for (const m of it.erase ?? []) {
      if (m.k !== "line") continue
      occs.forEach((o, oi) => {
        if (o.block !== m.b || o.start < range.from || o.start >= range.to) return
        const next = occs[oi + 1]
        const rawTo = next ? Math.min(next.start, range.to) : range.to
        let from = snap(o.start)
        let to = rawTo >= range.to ? range.to : snap(rawTo)
        if (to <= from) {
          from = o.start
          to = rawTo
        }
        cuts.push({ from: Math.max(from, range.from), to: Math.min(to, range.to) })
      })
    }
    for (const p of subtract(range, cuts.sort((a, b) => a.from - b.from))) {
      segments.push({ item, from: p.from, to: p.to, at })
      at += p.to - p.from
    }
  })

  return { segments, duration: at, unsynced }
}

/** El pla és l'original sencer seguit (no cal cap salt). */
export function isLinearPlan(plan: PlaybackPlan, tl: Timeline): boolean {
  const s = plan.segments
  if (!s.length || s[0].from > 0 || s[s.length - 1].to < tl.duration) return false
  return s.every((seg, i) => i === 0 || seg.from === s[i - 1].to)
}

/**
 * Cronologia en temps virtual per al content arranjat: pulsacions, acords, ocurrències i
 * seccions dels segments, encadenats. Les ocurrències apunten als blocs del content arranjat
 * (`block`) i els acords als seus spans; el que s'ha esborrat ja no s'hi pot ressaltar (però
 * l'acompanyament continua sonant igual: esborrar acords és només visual).
 */
export function virtualizeTimeline(tl: Timeline, plan: PlaybackPlan, arranged: ArrangedContent): Timeline {
  const originOf = new Map<string, { out: number; spans: number[] }>()
  arranged.origin.forEach((o, out) => {
    if (o && o.spans.length) originOf.set(`${o.item}:${o.block}`, { out, spans: o.spans })
  })

  const beats: Beat[] = []
  const pulses: Pulse[] = []
  const chords: TimedChord[] = []
  const occurrences: SyncOccurrence[] = []
  const sections: SyncSection[] = []
  let bar = 0

  plan.segments.forEach((seg) => {
    const shift = (t: number) => t - seg.from + seg.at
    const inSeg = (t: number) => t >= seg.from && t < seg.to

    for (const b of tl.beats) if (inSeg(b.t)) beats.push({ t: shift(b.t), downbeat: b.downbeat })
    let firstPulse = true
    for (const p of tl.pulses) {
      if (!inSeg(p.t)) continue
      if (p.inBar === 0 || firstPulse) bar++
      firstPulse = false
      pulses.push({ ...p, t: shift(p.t), bar })
    }

    // Ocurrències del segment (les que hi comencen) que encara es veuen al content arranjat
    const occMap = new Map<number, number>()
    tl.occurrences.forEach((o, oi) => {
      if (!inSeg(o.start)) return
      const org = originOf.get(`${seg.item}:${o.block}`)
      if (!org) return
      occMap.set(oi, occurrences.length)
      occurrences.push({
        block: org.out,
        rep: o.rep,
        start: shift(o.start),
        end: shift(Math.min(o.end, seg.to)),
        words: o.words
          .filter((w) => w[0] < seg.to)
          .map((w): [number, number, boolean] => [shift(w[0]), shift(Math.min(w[1], seg.to)), w[2]]),
        chords: o.chords.flatMap((c) => {
          const span = org.spans[c.span] ?? -1
          return span >= 0 && c.t < seg.to ? [{ ...c, span, t: shift(c.t) }] : []
        }),
      })
    })

    const mapChord = (c: TimedChord, t: number): TimedChord => {
      if (c.source !== "content") return { ...c, t }
      const occ = occMap.get(c.occ)
      const o = tl.occurrences[c.occ]
      const span = o ? originOf.get(`${seg.item}:${o.block}`)?.spans[c.span] ?? -1 : -1
      return occ === undefined || span < 0
        ? { ...c, t, source: "analysis", occ: -1, span: -1 }
        : { ...c, t, occ, span }
    }

    // L'acord que ja sonava en entrar al segment, i els que hi comencen
    const k = indexAt(tl.chords, seg.from)
    if (k >= 0 && tl.chords[k].t < seg.from) chords.push({ ...mapChord(tl.chords[k], seg.at), source: "analysis", occ: -1, span: -1 })
    for (const c of tl.chords) if (inSeg(c.t)) chords.push(mapChord(c, shift(c.t)))

    // Secció: una per ítem seguit (els talls d'un vers no en fan una de nova)
    const head = arranged.heads[seg.item] ?? -1
    const last = sections[sections.length - 1]
    const prevSeg = plan.segments[plan.segments.indexOf(seg) - 1]
    if (last && prevSeg && prevSeg.item === seg.item) {
      last.end = seg.at + (seg.to - seg.from)
    } else if (head >= 0) {
      sections.push({ block: head, rep: 0, start: seg.at, end: seg.at + (seg.to - seg.from) })
    }
  })

  pulses.forEach((p, i) => {
    if (i + 1 < pulses.length) p.dur = pulses[i + 1].t - p.t
  })
  if (chords.length && chords[chords.length - 1].label !== null) {
    chords.push({ t: plan.duration, label: null, source: "analysis", occ: -1, span: -1, sub: 0 })
  }
  const firstChord = chords.find((c) => c.label !== null)

  return {
    ...tl,
    duration: plan.duration,
    beats,
    pulses,
    chords,
    occurrences,
    sections,
    firstChordT: firstChord ? firstChord.t : 0,
  }
}
