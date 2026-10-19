/**
 * src/lib/transcriber/sync.ts — Sincronització d'una anàlisi amb el content actual d'una cançó.
 *
 * L'anàlisi (song_analyses) és immutable: diu què passa a l'àudio. El content s'edita. Aquesta
 * funció calcula al moment, sense desar res, quan sona cada línia i cada <ch> del content:
 *
 *  1. Desplega el content en "interpretació": expandeix les marques "x2", "bis" i "(x2)" amb les
 *     regles del transcriptor (la mateixa línia pot sonar diverses vegades: ocurrències).
 *  2. Alinea les subparaules del content amb les paraules de l'anàlisi (Needleman-Wunsch amb
 *     coincidència aproximada, com lyrics_align.py del transcriptor) i interpola les que no casen.
 *  3. Detecta el transport content → àudio (capo, o un vídeo en un altre to) provant els 12.
 *  4. Cada <ch> pren el temps de la seva paraula (i de la lletra dins la paraula) i s'ajusta al
 *     canvi d'acord concordant de l'anàlisi més proper. Les línies només d'acords s'alineen amb els
 *     canvis de l'anàlisi de la seva franja.
 *  5. Dona una qualitat i un informe de diferències (línies no cantades, trams que falten al
 *     content, acords que no concorden).
 *
 * Pur (sense Node ni BD): s'executa al servidor i al navegador. Temps en ms enters.
 * Pla: .claude/PLAN_SYNC.md del repo transcriptor.
 */

import { parse } from "../editor/model"
import type { AnalysisCompact } from "../schemas/transcriber"
import { transposeChord } from "../transpose"
import {
  MARKER_TOKEN_RE,
  REPEAT_ALONE_RE,
  REPEAT_END_BARE_RE,
  REPEAT_END_RE,
  chordClass,
  decodeEntities,
  normalize,
  repeatCount,
  sameClass,
  similarity,
  splitChain,
  type ChordClass,
} from "./syncText"

// ── Paràmetres ────────────────────────────────────────────────────────────────

const SIM_THRESHOLD = 0.6 // similitud mínima per aparellar dues subparaules
const GAP = -0.5
const MAX_INTERP_STEP_MS = 400 // pas màxim per subparaula interpolada
const EDGE_INTERP_STEP_MS = 300
const MAX_LINE_GAP_MS = 6000 // dins d'una línia, un buit més llarg indica paraules mal aparellades
const SNAP_BEFORE_BEATS = 1 // finestra per ajustar un acord al canvi de l'anàlisi
const SNAP_AFTER_BEATS = 1.5
const SNAP_EARLY_PENALTY = 1.5 // a la BD l'acord va a la paraula que ja ha començat: el canvi sol ser després
const CHAIN_DEFAULT_BARS = 2 // durada per defecte d'una cadena d'acords sense límit clar
// Qualitat mínima per oferir funcions de reproducció (ajustada amb scripts/validate-sync.ts)
const OK_MIN_COVERAGE = 0.5
const OK_MIN_WORDS = 0.6
const OK_MIN_CHORDS = 0.5 // cançons sense lletra
const MIN_MISSING_WORDS = 4 // trams de l'anàlisi sense parella a partir d'aquí surten a l'informe

// ── Tipus públics ─────────────────────────────────────────────────────────────

export interface SyncChord {
  span: number // índex del span <ch> dins el bloc
  sub: number // posició dins una cadena "G→Bm→C"
  label: string // acord escrit
  t: number
  match: boolean // l'anàlisi hi concorda (arrel + major/menor, amb el transport)
  heard?: string // si no concorda: el que sona, en el to del content
}

export interface SyncOccurrence {
  block: number // índex del bloc a parse(content)
  rep: number // 0 = primera vegada que sona aquesta línia
  start: number
  end: number
  words: [start: number, end: number, matched: boolean][] // paraules visibles, en ordre
  chords: SyncChord[]
}

export interface SyncSection {
  block: number // índex del bloc <sec>
  rep: number
  start: number
  end: number
}

export interface SyncReport {
  unsungLines: { block: number; rep: number }[]
  missingSpans: { start: number; end: number; text: string }[]
  chordMismatches: {
    block: number
    rep: number
    span: number
    sub: number
    written: string
    heard: string | null
    t: number
  }[]
}

export interface SyncResult {
  quality: {
    coverage: number | null // part de la lletra del content que es canta; null si no hi ha lletra
    words: number | null // de la lletra que es canta, part aparellada amb paraules que l'ASR va sentir
    chords: number | null // acords escrits que concorden; null si no n'hi ha
    ok: boolean // prou bona per a funcions de reproducció
  }
  transpose: number // semitons content → àudio
  occurrences: SyncOccurrence[] // en ordre de l'àudio; sense les línies no cantades
  sections: SyncSection[]
  report: SyncReport
}

// ── Content ───────────────────────────────────────────────────────────────────

interface LineWord {
  text: string
  from: number // posició al text de la línia (amb entitats descodificades)
  to: number
  subs: string[]
}

interface LineChord {
  span: number
  pos: number
  labels: string[]
}

interface Line {
  block: number
  section: number | null
  words: LineWord[]
  chords: LineChord[]
}

interface Occ {
  line: number
  rep: number
}

function tokenize(text: string): LineWord[] {
  const words: LineWord[] = []
  for (const m of text.matchAll(/\S+/g)) {
    const subs = normalize(m[0])
    if (subs.length === 0 || MARKER_TOKEN_RE.test(m[0])) continue
    words.push({ text: m[0], from: m.index!, to: m.index! + m[0].length, subs })
  }
  return words
}

/** Línies del content i ordre en què sonen (amb les repeticions desplegades). */
function readContent(content: string): { lines: Line[]; occs: Occ[] } {
  const doc = parse(content.replace(/\r/g, ""))
  const lines: Line[] = []
  const occs: Occ[] = []
  const reps = new Map<number, number>()
  const push = (line: number) => {
    const rep = reps.get(line) ?? 0
    reps.set(line, rep + 1)
    occs.push({ line, rep })
  }
  let section: number | null = null
  let blockStart = 0

  doc.blocks.forEach((block, bi) => {
    if (block.kind === "section") {
      section = bi
      blockStart = occs.length
      return
    }
    if (block.kind !== "lyric") return
    let text = ""
    const chords: LineChord[] = []
    block.spans.forEach((span, si) => {
      if (span.kind === "chord") {
        const labels = splitChain(span.chord)
        if (labels.length > 0) chords.push({ span: si, pos: text.length, labels })
      } else {
        text += decodeEntities(span.text)
      }
    })
    const plain = text.replace(/\s+/g, " ").trim()
    if (!plain && chords.length === 0) return

    const alone = REPEAT_ALONE_RE.exec(plain)
    if (alone && chords.length === 0) {
      const bloc = occs.slice(blockStart).map((o) => o.line)
      for (let k = 1; k < repeatCount(alone); k++) bloc.forEach(push)
      blockStart = occs.length
      return
    }
    let times = 1
    let body = text
    if (!alone) {
      const end = REPEAT_END_RE.exec(text) ?? REPEAT_END_BARE_RE.exec(text)
      if (end) {
        times = repeatCount(end)
        body = text.slice(0, end.index)
      }
    }
    // Una línia d'acords amb una marca ("<ch>F#m</ch>x2 <ch>Bm</ch>") no es repeteix: la marca
    // sol voler dir que l'acord dura més, i els acords s'alineen igualment amb l'anàlisi
    const words = tokenize(body)
    if (words.length === 0) times = 1
    if (words.length === 0 && chords.length === 0) return
    lines.push({ block: bi, section, words, chords })
    for (let k = 0; k < times; k++) push(lines.length - 1)
  })
  return { lines, occs }
}

// ── Anàlisi ───────────────────────────────────────────────────────────────────

interface AChord {
  start: number
  end: number
  label: string
  cls: ChordClass | null
}

interface Analysis {
  duration: number
  beats: number[]
  ibi: number // interval entre pulsacions (mediana)
  beatsPerBar: number
  chords: AChord[]
  changes: AChord[] // acords on canvia la classe majmin
  words: { start: number; end: number; text: string; heard: boolean }[]
}

function readAnalysis(a: AnalysisCompact): Analysis {
  const beats: number[] = []
  let acc = 0
  for (const dt of a.beats.dt) {
    acc += dt
    beats.push(acc)
  }
  const diffs = beats.slice(1).map((t, i) => t - beats[i]).sort((x, y) => x - y)
  const ibi = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 500
  const chords: AChord[] = a.chords.map((c) => ({ start: c[0], end: c[1], label: c[2], cls: chordClass(c[2]) }))
  const changes: AChord[] = []
  for (const c of chords) {
    const prev = changes[changes.length - 1]
    if (!c.cls) continue
    if (prev && sameClass(prev.cls, c.cls) && c.start - prev.end < ibi) {
      prev.end = c.end
      continue
    }
    changes.push({ ...c })
  }
  return {
    duration: Math.round(a.source.duration_s * 1000),
    beats,
    ibi: Math.max(ibi, 100),
    beatsPerBar: a.tempo?.time_signature[0] ?? 4,
    chords,
    changes,
    words: a.words.map((w) => ({ start: w[0], end: w[1], text: decodeEntities(w[2]), heard: w[3] !== null })),
  }
}

function chordAt(an: Analysis, t: number): AChord | null {
  let lo = 0
  let hi = an.chords.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = an.chords[mid]
    if (t < c.start) hi = mid - 1
    else if (t >= c.end) lo = mid + 1
    else return c
  }
  return null
}

function nearestBeat(an: Analysis, t: number): number {
  let best = t
  let bestD = an.ibi / 2
  for (const b of an.beats) {
    const d = Math.abs(b - t)
    if (d <= bestD) {
      best = b
      bestD = d
    } else if (b > t) break
  }
  return best
}

// ── Alineació de paraules ─────────────────────────────────────────────────────

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "")
}

/** Per a cada element de `ref`, l'índex aparellat de `hyp` (o -1). Port de _aparella(). */
function alignWords(ref: string[], hyp: string[]): Int32Array {
  const n = ref.length
  const m = hyp.length
  const pair = new Int32Array(n).fill(-1)
  if (n === 0 || m === 0) return pair

  const cache = new Map<string, number>()
  const sim = new Float32Array(n * m)
  for (let i = 0; i < n; i++) {
    const a = ref[i]
    for (let j = 0; j < m; j++) {
      const b = hyp[j]
      // Paraules de longitud molt diferent no poden arribar al llindar
      if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.6) continue
      const key = a + "\u0000" + b
      let s = cache.get(key)
      if (s === undefined) {
        // Sense accents: corregir "be" → "bé" al content no ha de trencar la parella
        s = Math.max(similarity(a, b), 0.95 * similarity(fold(a), fold(b)))
        cache.set(key, s)
      }
      sim[i * m + j] = s
    }
  }

  const w = m + 1
  const score = new Float32Array((n + 1) * w)
  const dir = new Uint8Array((n + 1) * w) // 0 diagonal, 1 amunt, 2 esquerra
  for (let i = 0; i <= n; i++) score[i * w] = GAP * i
  for (let j = 0; j <= m; j++) score[j] = GAP * j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim[(i - 1) * m + (j - 1)]
      const d = score[(i - 1) * w + j - 1] + (s >= SIM_THRESHOLD ? 2 * s : -1)
      const u = score[(i - 1) * w + j] + GAP
      const l = score[i * w + j - 1] + GAP
      if (d >= u && d >= l) {
        score[i * w + j] = d
      } else if (u >= l) {
        score[i * w + j] = u
        dir[i * w + j] = 1
      } else {
        score[i * w + j] = l
        dir[i * w + j] = 2
      }
    }
  }

  // Finals lliures: si el content té línies de més al final (o l'anàlisi en té), no es penalitzen.
  // En cas d'empat, el text cantat més aviat (com al transcriptor).
  let bi = 0
  for (let i = 1; i <= n; i++) if (score[i * w + m] > score[bi * w + m]) bi = i
  let bj = m
  for (let j = 0; j < m; j++) if (score[n * w + j] > score[bi * w + bj]) {
    bi = n
    bj = j
  }
  let i = bi
  let j = bj
  while (i > 0 && j > 0) {
    const d = dir[i * w + j]
    if (d === 0) {
      if (sim[(i - 1) * m + (j - 1)] >= SIM_THRESHOLD) pair[i - 1] = j - 1
      i--
      j--
    } else if (d === 1) i--
    else j--
  }
  return pair
}

// ── Sincronització ────────────────────────────────────────────────────────────

interface WordTime {
  start: number
  end: number
  matched: boolean // aparellada amb una paraula de l'anàlisi
  heard: number // subparaules aparellades amb paraules sentides
}

interface Pending {
  occ: number
  chord: LineChord
  anchor: number // temps d'ancoratge de la primera etiqueta
}

export function syncAnalysis(analysis: AnalysisCompact, content: string, capo = 0): SyncResult {
  const an = readAnalysis(analysis)
  const { lines, occs } = readContent(content)

  // 1. Subparaules del content (per ocurrència) i de l'anàlisi
  const ref: string[] = []
  const refOwner: { occ: number; word: number }[] = []
  occs.forEach((o, oi) => {
    lines[o.line].words.forEach((word, wi) => {
      for (const s of word.subs) {
        ref.push(s)
        refOwner.push({ occ: oi, word: wi })
      }
    })
  })
  const hyp: string[] = []
  const hypWord: number[] = []
  an.words.forEach((word, wi) => {
    for (const s of normalize(word.text)) {
      hyp.push(s)
      hypWord.push(wi)
    }
  })

  // 2. Alineació i interpolació
  const pair = alignWords(ref, hyp)
  const subStart = new Float64Array(ref.length)
  const subEnd = new Float64Array(ref.length)
  const known: number[] = []
  for (let k = 0; k < ref.length; k++) {
    if (pair[k] < 0) continue
    const aw = an.words[hypWord[pair[k]]]
    subStart[k] = aw.start
    subEnd[k] = aw.end
    known.push(k)
  }
  let next = 0
  for (let k = 0; k < ref.length; k++) {
    if (pair[k] >= 0) {
      next++
      continue
    }
    const ant = next > 0 ? known[next - 1] : -1
    const seg = next < known.length ? known[next] : -1
    let t: number
    if (ant >= 0 && seg >= 0) {
      // A ritme de parla just després de la paraula coneguda: si el buit és llarg (un tram
      // instrumental), repartir-les uniformement estiraria la línia
      const step = Math.min((subStart[seg] - subEnd[ant]) / (seg - ant), MAX_INTERP_STEP_MS)
      t = subEnd[ant] + step * (k - ant)
    } else if (ant >= 0) {
      t = Math.min(subEnd[ant] + EDGE_INTERP_STEP_MS * (k - ant), an.duration)
    } else if (seg >= 0) {
      t = Math.max(subStart[seg] - EDGE_INTERP_STEP_MS * (seg - k), 0)
    } else {
      t = (an.duration * k) / Math.max(ref.length, 1)
    }
    subStart[k] = subEnd[k] = t
  }

  // Temps de cada paraula visible de cada ocurrència
  const wordTimes: WordTime[][] = occs.map((o) =>
    lines[o.line].words.map(() => ({ start: Infinity, end: -Infinity, matched: false, heard: 0 })),
  )
  let heardSubs = 0
  for (let k = 0; k < ref.length; k++) {
    const { occ, word } = refOwner[k]
    const wt = wordTimes[occ][word]
    wt.start = Math.min(wt.start, subStart[k])
    wt.end = Math.max(wt.end, subEnd[k])
    if (pair[k] >= 0) {
      wt.matched = true
      if (an.words[hypWord[pair[k]]].heard) {
        wt.heard++
        heardSubs++
      }
    }
  }
  // Una línia no té buits llargs: les paraules d'abans d'un buit així estan mal aparellades
  for (const wts of wordTimes) {
    for (let k = wts.length - 2; k >= 0; k--) {
      let following = wts[k + 1].start
      if (following - wts[k].end <= MAX_LINE_GAP_MS) continue
      for (let x = k; x >= 0; x--) {
        const dur = Math.min(Math.max(wts[x].end - wts[x].start, 150), MAX_INTERP_STEP_MS)
        wts[x].end = following - 50
        wts[x].start = wts[x].end - dur
        following = wts[x].start
      }
      break
    }
  }

  // Línies no cantades: sense cap paraula aparellada, si són llargues, si en tenen d'altres al
  // costat en la mateixa situació, o si són abans de la primera / després de l'última cantada
  const isLyric = occs.map((o) => lines[o.line].words.length > 0)
  const anyMatched = wordTimes.map((wts) => wts.some((w) => w.matched))
  const lyricIdx = occs.map((_, i) => i).filter((i) => isLyric[i])
  const firstSung = lyricIdx.find((i) => anyMatched[i]) ?? Infinity
  const lastSung = [...lyricIdx].reverse().find((i) => anyMatched[i]) ?? -Infinity
  const sung = occs.map(() => true)
  lyricIdx.forEach((oi, k) => {
    if (anyMatched[oi]) return
    const subs = lines[occs[oi].line].words.reduce((n, w) => n + w.subs.length, 0)
    const prevUnmatched = k > 0 && !anyMatched[lyricIdx[k - 1]]
    const nextUnmatched = k + 1 < lyricIdx.length && !anyMatched[lyricIdx[k + 1]]
    if (subs >= 2 || prevUnmatched || nextUnmatched || oi < firstSung || oi > lastSung) sung[oi] = false
  })

  // 3. Ancoratge dels acords de les línies amb lletra
  const pending: Pending[] = []
  occs.forEach((o, oi) => {
    if (!isLyric[oi] || !sung[oi]) return
    const line = lines[o.line]
    const wts = wordTimes[oi]
    for (const chord of line.chords) {
      let anchor: number
      const inside = line.words.findIndex((w) => chord.pos >= w.from && chord.pos < w.to)
      if (inside >= 0) {
        const w = line.words[inside]
        const frac = (chord.pos - w.from) / (w.to - w.from)
        anchor = wts[inside].start + frac * (wts[inside].end - wts[inside].start)
      } else {
        const after = line.words.findIndex((w) => w.from >= chord.pos)
        anchor = after >= 0 ? wts[after].start : wts[wts.length - 1].end
      }
      pending.push({ occ: oi, chord, anchor })
    }
  })

  // 4. Transport: el desplaçament amb què més acords escrits troben el seu acord a prop
  const before = SNAP_BEFORE_BEATS * an.ibi
  const after = SNAP_AFTER_BEATS * an.ibi
  const votes = new Array<number>(12).fill(0)
  for (const p of pending) {
    const cls = chordClass(p.chord.labels[0])
    if (!cls) continue
    const near = an.chords.filter((c) => c.cls && c.end > p.anchor - before && c.start < p.anchor + after)
    for (let s = 0; s < 12; s++) if (near.some((c) => sameClass(cls, c.cls, s))) votes[s]++
  }
  const prior = ((capo % 12) + 12) % 12
  let shift = prior
  for (let s = 0; s < 12; s++) if (votes[s] > votes[shift]) shift = s
  if (votes[shift] === 0) shift = prior

  const heardIn = (c: AChord | null) => (c ? transposeChord(c.label, -shift) : null)

  // 5. Temps dels acords de les línies amb lletra
  const result: SyncChord[][] = occs.map(() => [])
  const occStart = occs.map((_, oi) => (isLyric[oi] ? Math.min(...wordTimes[oi].map((w) => w.start)) : 0))
  const occEnd = occs.map((_, oi) => (isLyric[oi] ? Math.max(...wordTimes[oi].map((w) => w.end)) : 0))
  const nextSungStart = (oi: number) => {
    for (let k = oi + 1; k < occs.length; k++) if (isLyric[k] && sung[k]) return occStart[k]
    return an.duration
  }

  pending.forEach((p, pi) => {
    const out = result[p.occ]
    const prevT = out.length ? out[out.length - 1].t : -Infinity
    const nextAnchor =
      pi + 1 < pending.length && pending[pi + 1].occ === p.occ ? pending[pi + 1].anchor : nextSungStart(p.occ)
    let lo = Math.max(prevT + 1, p.anchor - before)
    p.chord.labels.forEach((label, sub) => {
      const cls = chordClass(label)
      let t: number | null = null
      let match = false
      if (sub === 0) {
        // Canvi concordant més proper dins la finestra
        let bestCost = Infinity
        for (const c of an.changes) {
          if (c.start < lo || c.start > p.anchor + after) continue
          if (!sameClass(cls, c.cls, shift)) continue
          const d = c.start - p.anchor
          const cost = d >= 0 ? d : -d * SNAP_EARLY_PENALTY
          if (cost < bestCost) {
            bestCost = cost
            t = c.start
          }
        }
        if (t !== null) match = true
        else {
          // Ja sonava (p. ex. l'acord repetit a l'inici de línia)
          t = Math.max(p.anchor, lo)
          match = sameClass(cls, chordAt(an, t)?.cls ?? null, shift)
          if (!match) t = Math.max(nearestBeat(an, t), lo)
        }
      } else {
        // Acords següents d'una cadena: els canvis concordants següents, en ordre
        const limit = Math.max(Math.min(nextAnchor, lo + CHAIN_DEFAULT_BARS * an.beatsPerBar * an.ibi), lo)
        const c = an.changes.find((c) => c.start >= lo && c.start < limit && sameClass(cls, c.cls, shift))
        if (c) {
          t = c.start
          match = true
        } else {
          const remaining = p.chord.labels.length - sub
          t = nearestBeat(an, lo + (limit - lo) / (remaining + 1))
          t = Math.max(t, lo)
          match = sameClass(cls, chordAt(an, t)?.cls ?? null, shift)
        }
      }
      const entry: SyncChord = { span: p.chord.span, sub, label, t: Math.round(t), match }
      if (!match) entry.heard = heardIn(chordAt(an, t)) ?? undefined
      out.push(entry)
      lo = t + an.ibi / 2
    })
  })

  // 6. Línies només d'acords: s'alineen amb els canvis de l'anàlisi de la seva franja
  let k = 0
  while (k < occs.length) {
    if (isLyric[k] || !sung[k]) {
      k++
      continue
    }
    const group: number[] = []
    while (k < occs.length && (!isLyric[k] || !sung[k])) {
      if (!isLyric[k]) group.push(k)
      k++
    }
    const prevLyric = [...Array(group[0]).keys()].reverse().find((i) => isLyric[i] && sung[i])
    let lo = 0
    if (prevLyric !== undefined) {
      const chords = result[prevLyric]
      lo = Math.max(occEnd[prevLyric], chords.length ? chords[chords.length - 1].t + an.ibi / 2 : 0)
    }
    const hi = k < occs.length ? occStart[k] : an.duration
    placeChordLines(an, lines, occs, group, Math.round(lo), Math.max(Math.round(hi), Math.round(lo)), shift, result)
    group.forEach((oi, gi) => {
      const chords = result[oi]
      occStart[oi] = chords.length ? chords[0].t : lo
      const following = gi + 1 < group.length ? result[group[gi + 1]] : null
      occEnd[oi] = following && following.length ? following[0].t : hi
    })
  }

  // 7. Resultat
  const occurrences: SyncOccurrence[] = []
  const report: SyncReport = { unsungLines: [], missingSpans: [], chordMismatches: [] }
  let chordTotal = 0
  let chordMatched = 0
  occs.forEach((o, oi) => {
    const line = lines[o.line]
    if (!sung[oi]) {
      report.unsungLines.push({ block: line.block, rep: o.rep })
      return
    }
    const chords = result[oi]
    for (const c of chords) {
      chordTotal++
      if (c.match) chordMatched++
      else {
        report.chordMismatches.push({
          block: line.block, rep: o.rep, span: c.span, sub: c.sub, written: c.label, heard: c.heard ?? null, t: c.t,
        })
      }
    }
    const start = Math.min(occStart[oi], chords.length ? chords[0].t : Infinity)
    const end = Math.max(occEnd[oi], start)
    occurrences.push({
      block: line.block,
      rep: o.rep,
      start: Math.round(start),
      end: Math.round(end),
      words: wordTimes[oi].map((w) => [Math.round(w.start), Math.round(w.end), w.matched]),
      chords,
    })
  })

  // Trams de l'anàlisi sense parella al content
  const usedHyp = new Uint8Array(hyp.length)
  for (const j of pair) if (j >= 0) usedHyp[j] = 1
  const wordUsed = new Uint8Array(an.words.length)
  hypWord.forEach((wi, j) => {
    if (usedHyp[j]) wordUsed[wi] = 1
  })
  let run: number[] = []
  const flush = () => {
    if (run.length >= MIN_MISSING_WORDS) {
      report.missingSpans.push({
        start: an.words[run[0]].start,
        end: an.words[run[run.length - 1]].end,
        text: run.map((i) => an.words[i].text).join(" "),
      })
    }
    run = []
  }
  an.words.forEach((w, wi) => {
    if (normalize(w.text).length === 0) return
    if (wordUsed[wi]) flush()
    else run.push(wi)
  })
  flush()

  let sungSubs = 0
  occs.forEach((o, oi) => {
    if (sung[oi]) sungSubs += lines[o.line].words.reduce((n, w) => n + w.subs.length, 0)
  })
  const coverage = ref.length ? sungSubs / ref.length : null
  const words = ref.length ? (sungSubs ? heardSubs / sungSubs : 0) : null
  const chords = chordTotal ? chordMatched / chordTotal : null
  const ok =
    coverage !== null && words !== null
      ? coverage >= OK_MIN_COVERAGE && words >= OK_MIN_WORDS
      : chords !== null && chords >= OK_MIN_CHORDS

  return {
    quality: { coverage: round3(coverage), words: round3(words), chords: round3(chords), ok },
    transpose: shift > 6 ? shift - 12 : shift,
    occurrences,
    sections: sectionsOf(lines, occurrences),
    report,
  }
}

function round3(x: number | null): number | null {
  return x === null ? null : Math.round(x * 1000) / 1000
}

/**
 * Acords d'un grup de línies només d'acords dins la franja [lo, hi): s'alinea la seqüència escrita
 * amb la dels canvis de l'anàlisi (Needleman-Wunsch per classe majmin). Cada coincidència suma una
 * mica més com més aviat és: si el patró es toca diverses vegades, casa amb la primera.
 */
function placeChordLines(
  an: Analysis,
  lines: Line[],
  occs: Occ[],
  group: number[],
  lo: number,
  hi: number,
  shift: number,
  result: SyncChord[][],
) {
  const written: { occ: number; span: number; sub: number; label: string; cls: ChordClass | null }[] = []
  for (const oi of group) {
    for (const c of lines[occs[oi].line].chords) {
      c.labels.forEach((label, sub) => written.push({ occ: oi, span: c.span, sub, label, cls: chordClass(label) }))
    }
  }
  if (written.length === 0) return
  const heard = an.changes.filter((c) => c.start >= lo && c.start < hi)

  const W = written
  const H = heard
  const n = W.length
  const m = H.length
  const w = m + 1
  const score = new Float64Array((n + 1) * w)
  const dir = new Uint8Array((n + 1) * w)
  const EARLY_BONUS = 0.05 // molt menys que qualsevol forat: només desfà empats
  const GAP_W = -0.4 // acord escrit sense canvi a l'anàlisi
  const GAP_H = -0.1 // canvi de l'anàlisi no escrit (patrons que es repeteixen)
  for (let i = 1; i <= n; i++) {
    score[i * w] = GAP_W * i
    dir[i * w] = 1
  }
  for (let j = 1; j <= m; j++) {
    score[j] = GAP_H * j
    dir[j] = 2
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const early = EARLY_BONUS * (1 - (H[j - 1].start - lo) / Math.max(hi - lo, 1))
      const d = score[(i - 1) * w + j - 1] + (sameClass(W[i - 1].cls, H[j - 1].cls, shift) ? 1 + early : -0.3)
      const u = score[(i - 1) * w + j] + GAP_W
      const l = score[i * w + j - 1] + GAP_H
      if (d >= u && d >= l) score[i * w + j] = d
      else if (u >= l) {
        score[i * w + j] = u
        dir[i * w + j] = 1
      } else {
        score[i * w + j] = l
        dir[i * w + j] = 2
      }
    }
  }
  const times: (number | null)[] = new Array(n).fill(null)
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const d = dir[i * w + j]
    if (i > 0 && j > 0 && d === 0) {
      times[i - 1] = H[j - 1].start
      i--
      j--
    } else if (i > 0 && (j === 0 || d === 1)) i--
    else j--
  }

  // Els que no han casat es reparteixen entre els veïns coneguts
  for (let x = 0; x < n; x++) {
    if (times[x] !== null) continue
    let y = x
    while (y < n && times[y] === null) y++
    const from = x > 0 ? (times[x - 1] as number) : lo
    const to = y < n ? (times[y] as number) : hi
    const lead = x > 0 ? 1 : 0 // a l'inici de la franja, el primer acord va just a `lo`
    for (let z = x; z < y; z++) {
      const t = from + ((to - from) * (z - x + lead)) / (y - x + lead)
      times[z] = Math.max(Math.round(nearestBeat(an, t)), from)
    }
    x = y
  }

  written.forEach((wc, x) => {
    const t = times[x] as number
    const sounding = chordAt(an, t)
    const match = sameClass(wc.cls, sounding?.cls ?? null, shift)
    const entry: SyncChord = { span: wc.span, sub: wc.sub, label: wc.label, t, match }
    if (!match && sounding) entry.heard = transposeChord(sounding.label, -shift)
    result[wc.occ].push(entry)
  })
}

/** Seccions: ocurrències seguides amb la mateixa <sec>; una línia que torna enrere obre una repetició. */
function sectionsOf(lines: Line[], occurrences: SyncOccurrence[]): SyncSection[] {
  const sectionOfBlock = new Map<number, number | null>()
  for (const l of lines) sectionOfBlock.set(l.block, l.section)
  const sections: SyncSection[] = []
  const reps = new Map<number, number>()
  let current: SyncSection | null = null
  let lastBlock = -1
  for (const o of occurrences) {
    const sec = sectionOfBlock.get(o.block) ?? null
    if (sec === null) {
      current = null
      continue
    }
    if (!current || current.block !== sec || o.block <= lastBlock) {
      const rep: number = reps.get(sec) ?? 0
      reps.set(sec, rep + 1)
      current = { block: sec, rep, start: o.start, end: o.end }
      sections.push(current)
    }
    current.end = Math.max(current.end, o.end)
    lastBlock = o.block
  }
  return sections
}
