/**
 * src/lib/arrangement/apply.ts — Arranjament ràpid (§22): de la recepta al content.
 *
 * La recepta (`QuickArrangement`) no és un content nou: és l'ordre de les seccions de l'original
 * (cada una pot sortir-hi més d'un cop, o cap) i, per a cada instància, el que s'hi ha esborrat
 * (versos sencers, trossos de text, acords). Tot s'ancora al content original amb l'índex de
 * bloc de `parse()` + el text cru de la línia, com els reports (§20): si l'original ha canviat,
 * cada marca es reancora a la línia idèntica més propera de la mateixa secció, i les que ja no
 * hi són es perden (`lost`).
 *
 * `arrangeContent` torna també l'origen de cada bloc del content resultant (ítem + bloc de
 * l'original + mapa d'spans), que és el que fa servir el reproductor per seguir l'arranjament
 * amb la sincronització de l'original (plan.ts).
 *
 * Pur: servidor i navegador.
 */

import { parse, serialize, type Block, type Doc, type Inline } from "../editor/model"
import { applyTextEdits, blockLine, resolveBlock, toLineModel, type LineChord, type LineModel } from "../reports/apply"
import { contentHash } from "../reports/dedupe"
import type { ArrangeItem, EraseMark, QuickArrangement } from "../schemas/arrangement"

export type { ArrangeItem, EraseMark, QuickArrangement }

/** Secció de l'original: `sec` = índex del bloc <sec> (-1 = «Inici», les línies d'abans del primer). */
export interface Section {
  sec: number
  name: string
  /** Blocs del cos (sense el títol), en ordre. */
  blocks: number[]
}

/** Origen d'un bloc del content arranjat. */
export interface BlockOrigin {
  /** Índex de l'ítem de la recepta (instància). */
  item: number
  /** Bloc de l'original. */
  block: number
  /** Per a cada span de l'original, el seu índex al bloc resultant (-1 si ja no hi és). */
  spans: number[]
}

export interface ArrangedContent {
  content: string
  /** Un per bloc de `parse(content)`; null per a les línies buides de separació. */
  origin: (BlockOrigin | null)[]
  /** Per a cada ítem, el bloc resultant on comença (el títol, o la primera línia a «Inici»); -1 si no hi és. */
  heads: number[]
  /** Ítems resolts contra el content actual (els que no s'han pogut ancorar ja no hi són). */
  items: ArrangeItem[]
  /** Per a cada ítem resolt, el seu índex a la recepta. */
  itemIndex: number[]
  /** Seccions i marques que no s'han pogut reancorar. */
  lost: number
  /** Bloc del primer <sec> de l'original (les línies d'abans són «Inici»); Infinity si no n'hi ha. */
  firstSec: number
}

export function normalizeContent(content: string): string {
  return content.replace(/\r/g, "")
}

export function arrangementBase(content: string): string {
  return contentHash(normalizeContent(content))
}

/* ── Seccions ─────────────────────────────────────────────── */

export function splitSections(doc: Doc): Section[] {
  const sections: Section[] = []
  let current: Section = { sec: -1, name: "", blocks: [] }
  doc.blocks.forEach((b, i) => {
    if (b.kind === "section") {
      if (current.sec !== -1 || current.blocks.some((k) => doc.blocks[k].kind === "lyric")) sections.push(current)
      current = { sec: i, name: b.name, blocks: [] }
    } else {
      current.blocks.push(i)
    }
  })
  if (current.sec !== -1 || current.blocks.some((k) => doc.blocks[k].kind === "lyric")) sections.push(current)
  return sections
}

/** Cos d'una secció sense les línies buides del principi i del final. */
function trimmed(doc: Doc, blocks: number[]): number[] {
  let a = 0
  let z = blocks.length
  while (a < z && doc.blocks[blocks[a]].kind === "empty") a++
  while (z > a && doc.blocks[blocks[z - 1]].kind === "empty") z--
  return blocks.slice(a, z)
}

/* ── Resolució ────────────────────────────────────────────── */

export interface ResolvedArrangement {
  doc: Doc
  sections: Section[]
  /** Secció de cada bloc <sec> (i -1 → «Inici»). */
  bySec: Map<number, Section>
  items: ArrangeItem[]
  itemIndex: number[]
  lost: number
}

/** Ancora la recepta al content actual. */
export function resolveArrangement(content: string, qa: QuickArrangement): ResolvedArrangement {
  const doc = parse(normalizeContent(content))
  const lines = doc.blocks.map(blockLine)
  const sections = splitSections(doc)
  const bySec = new Map(sections.map((s) => [s.sec, s]))
  const items: ArrangeItem[] = []
  const itemIndex: number[] = []
  let lost = 0

  qa.items.forEach((it, k) => {
    let sec: number | null = it.sec
    if (sec >= 0) {
      const b = doc.blocks[sec]
      if (!(b?.kind === "section" && b.name === it.name)) sec = resolveBlock(lines, it.sec, `<sec>${it.name}</sec>`)
    }
    const section = sec === null ? undefined : bySec.get(sec)
    if (!section) {
      lost += 1 + (it.erase?.length ?? 0)
      return
    }
    const inSection = new Set(section.blocks)
    const erase: EraseMark[] = []
    for (const m of it.erase ?? []) {
      const b = resolveBlock(lines, m.b, m.line)
      const block = b === null ? null : doc.blocks[b]
      if (b === null || !inSection.has(b) || block?.kind !== "lyric") {
        lost++
        continue
      }
      const model = toLineModel(block.spans)
      if (m.k === "text" && !(m.start < m.end && m.end <= model.text.length)) {
        lost++
        continue
      }
      if (m.k === "chord" && m.ci >= model.chords.length) {
        lost++
        continue
      }
      erase.push({ ...m, b })
    }
    items.push(erase.length ? { sec: section.sec, name: section.name, erase } : { sec: section.sec, name: section.name })
    itemIndex.push(k)
  })

  return { doc, sections, bySec, items, itemIndex, lost }
}

/* ── Aplicació ────────────────────────────────────────────── */

/** Trams de text esborrats d'una línia, units i ordenats. */
export function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ start: r.start, end: r.end })
  }
  return out
}

/** Línia amb les marques aplicades, o null si no en queda res. */
function eraseLine(
  spans: Inline[],
  marks: EraseMark[],
): { spans: Inline[]; map: number[] } | null {
  if (marks.some((m) => m.k === "line")) return null
  const model: LineModel = toLineModel(spans)
  const ordinal = new Map<LineChord, number>()
  model.chords.forEach((c, i) => ordinal.set(c, i))
  for (const m of marks) if (m.k === "chord" && model.chords[m.ci]) model.chords[m.ci].removed = true
  const ranges = mergeRanges(marks.flatMap((m) => (m.k === "text" ? [{ start: m.start, end: m.end }] : [])))
  applyTextEdits(model, ranges.map((r) => ({ ...r, to: "" })))

  // Com fromLineModel, però recordant on va a parar cada acord
  const live = model.chords.filter((c) => !c.removed).sort((a, b) => a.offset - b.offset)
  if (!live.length && !model.text.trim()) return null
  const out: Inline[] = []
  const chordOut: number[] = model.chords.map(() => -1)
  let pos = 0
  for (const c of live) {
    const at = Math.min(Math.max(c.offset, 0), model.text.length)
    if (at > pos) out.push({ kind: "text", text: model.text.slice(pos, at) })
    chordOut[ordinal.get(c) ?? -1] = out.length
    out.push({ kind: "chord", chord: c.chord })
    pos = Math.max(pos, at)
  }
  if (pos < model.text.length) out.push({ kind: "text", text: model.text.slice(pos) })

  let ci = 0
  const map = spans.map((s) => (s.kind === "chord" ? chordOut[ci++] ?? -1 : -1))
  return { spans: out, map }
}

/** Content arranjat + origen de cada bloc. */
export function arrangeContent(content: string, qa: QuickArrangement): ArrangedContent {
  const r = resolveArrangement(content, qa)
  const { doc } = r
  const blocks: Block[] = []
  const origin: (BlockOrigin | null)[] = []
  const heads: number[] = qa.items.map(() => -1)

  r.items.forEach((it, k) => {
    const section = r.bySec.get(it.sec)
    if (!section) return
    const item = r.itemIndex[k]
    if (blocks.length) {
      blocks.push({ kind: "empty" })
      origin.push(null)
    }
    const marks = new Map<number, EraseMark[]>()
    for (const m of it.erase ?? []) marks.set(m.b, [...(marks.get(m.b) ?? []), m])

    if (section.sec >= 0) {
      heads[item] = blocks.length
      blocks.push({ kind: "section", name: section.name })
      origin.push({ item, block: section.sec, spans: [] })
    }
    for (const b of trimmed(doc, section.blocks)) {
      const block = doc.blocks[b]
      if (block.kind !== "lyric") {
        blocks.push(block)
        origin.push(null)
        continue
      }
      const ms = marks.get(b)
      if (!ms) {
        if (heads[item] < 0) heads[item] = blocks.length
        blocks.push(block)
        origin.push({ item, block: b, spans: block.spans.map((_, i) => i) })
        continue
      }
      const line = eraseLine(block.spans, ms)
      if (!line) continue
      if (heads[item] < 0) heads[item] = blocks.length
      blocks.push({ kind: "lyric", spans: line.spans })
      origin.push({ item, block: b, spans: line.map })
    }
  })

  // Les línies buides que queden juntes (en treure versos) es fonen
  const outBlocks: Block[] = []
  const outOrigin: (BlockOrigin | null)[] = []
  const remap: number[] = []
  blocks.forEach((b, i) => {
    const prev = outBlocks[outBlocks.length - 1]
    if (b.kind === "empty" && (!prev || prev.kind === "empty")) {
      remap.push(-1)
      return
    }
    remap.push(outBlocks.length)
    outBlocks.push(b)
    outOrigin.push(origin[i])
  })
  while (outBlocks.length && outBlocks[outBlocks.length - 1].kind === "empty") {
    outBlocks.pop()
    outOrigin.pop()
  }

  return {
    content: serialize({ blocks: outBlocks }),
    origin: outOrigin,
    heads: heads.map((h) => (h < 0 ? -1 : remap[h])),
    items: r.items,
    itemIndex: r.itemIndex,
    lost: r.lost,
    firstSec: r.sections.find((s) => s.sec >= 0)?.sec ?? Infinity,
  }
}

/** Content arranjat (sense recepta, l'original). */
export function applyArrangement(content: string, qa: QuickArrangement | null | undefined): string {
  return qa ? arrangeContent(content, qa).content : content
}
