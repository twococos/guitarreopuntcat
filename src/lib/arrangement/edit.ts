/**
 * src/lib/arrangement/edit.ts — Operacions de l'arranjador (diàleg «Arranjament ràpid»).
 *
 * Totes són immutables: reben una recepta i en tornen una de nova (historial de desfer).
 * Pur.
 */

import { parse } from "../editor/model"
import { blockLine, toLineModel } from "../reports/apply"
import {
  arrangementBase,
  mergeRanges,
  normalizeContent,
  resolveArrangement,
  splitSections,
  type ArrangeItem,
  type EraseMark,
  type QuickArrangement,
} from "./apply"

/** Recepta que reprodueix l'original tal qual. */
export function identityArrangement(content: string): QuickArrangement {
  const sections = splitSections(parse(normalizeContent(content)))
  return {
    v: 1,
    base: arrangementBase(content),
    items: sections.map((s) => ({ sec: s.sec, name: s.name })),
  }
}

/**
 * Recepta per editar al diàleg: la desada, reancorada al content actual (i amb la base al dia),
 * o l'original. `lost` = marques que no s'han pogut reancorar.
 */
export function editableArrangement(
  content: string,
  saved: QuickArrangement | null | undefined,
): { qa: QuickArrangement; lost: number } {
  if (!saved) return { qa: identityArrangement(content), lost: 0 }
  const r = resolveArrangement(content, saved)
  if (!r.items.length) return { qa: identityArrangement(content), lost: r.lost }
  return { qa: { v: 1, base: arrangementBase(content), items: r.items }, lost: r.lost }
}

/** La recepta no canvia res (cal desar null). */
export function isIdentity(content: string, qa: QuickArrangement): boolean {
  const id = identityArrangement(content).items
  const r = resolveArrangement(content, qa)
  return (
    r.lost === 0 &&
    r.items.length === id.length &&
    r.items.every((it, i) => it.sec === id[i].sec && !(it.erase?.length))
  )
}

/* ── Estructura ───────────────────────────────────────────── */

function withItems(qa: QuickArrangement, items: ArrangeItem[]): QuickArrangement {
  return { ...qa, items }
}

export function moveItem(qa: QuickArrangement, from: number, to: number): QuickArrangement {
  if (from === to || from < 0 || to < 0 || from >= qa.items.length || to >= qa.items.length) return qa
  const items = [...qa.items]
  const [it] = items.splice(from, 1)
  items.splice(to, 0, it)
  return withItems(qa, items)
}

/** Duplica l'ítem just a sota (sense les marques: la repetició comença neta). */
export function repeatItem(qa: QuickArrangement, idx: number): QuickArrangement {
  const it = qa.items[idx]
  if (!it || qa.items.length >= 64) return qa
  const items = [...qa.items]
  items.splice(idx + 1, 0, { sec: it.sec, name: it.name, erase: it.erase ? [...it.erase] : undefined })
  return withItems(qa, items)
}

export function removeItem(qa: QuickArrangement, idx: number): QuickArrangement {
  if (qa.items.length <= 1) return qa
  return withItems(qa, qa.items.filter((_, i) => i !== idx))
}

/** Torna una secció treta: després de l'última instància de la secció anterior, o al final. */
export function restoreSection(content: string, qa: QuickArrangement, sec: number): QuickArrangement {
  const sections = splitSections(parse(normalizeContent(content)))
  const s = sections.find((x) => x.sec === sec)
  if (!s || qa.items.length >= 64) return qa
  const order = sections.map((x) => x.sec)
  const pos = order.indexOf(sec)
  let at = qa.items.length
  for (let k = pos - 1; k >= 0 && at === qa.items.length; k--) {
    const i = qa.items.map((it) => it.sec).lastIndexOf(order[k])
    if (i >= 0) at = i + 1
  }
  if (at === qa.items.length && pos === 0) at = 0
  const items = [...qa.items]
  items.splice(at, 0, { sec: s.sec, name: s.name })
  return withItems(qa, items)
}

/** Seccions de l'original que no surten a la recepta. */
export function missingSections(content: string, qa: QuickArrangement): { sec: number; name: string }[] {
  const used = new Set(qa.items.map((it) => it.sec))
  return splitSections(parse(normalizeContent(content)))
    .filter((s) => !used.has(s.sec))
    .map((s) => ({ sec: s.sec, name: s.name }))
}

/* ── Goma ─────────────────────────────────────────────────── */

function lineOf(content: string, b: number): string {
  const block = parse(normalizeContent(content)).blocks[b]
  return block ? blockLine(block) : ""
}

function updateErase(qa: QuickArrangement, idx: number, fn: (marks: EraseMark[]) => EraseMark[]): QuickArrangement {
  const it = qa.items[idx]
  if (!it) return qa
  const erase = fn(it.erase ?? [])
  const items = [...qa.items]
  items[idx] = erase.length ? { ...it, erase } : { sec: it.sec, name: it.name }
  return withItems(qa, items)
}

/** Ratlla o recupera un vers sencer. */
export function toggleLine(content: string, qa: QuickArrangement, idx: number, b: number): QuickArrangement {
  return updateErase(qa, idx, (marks) => {
    if (marks.some((m) => m.k === "line" && m.b === b)) return marks.filter((m) => !(m.k === "line" && m.b === b))
    // El vers sencer absorbeix les marques que hi havia
    return [...marks.filter((m) => m.b !== b), { k: "line", b, line: lineOf(content, b) }]
  })
}

/** Ratlla o recupera un acord (`ci` = índex entre els acords de la línia). */
export function toggleChord(content: string, qa: QuickArrangement, idx: number, b: number, ci: number): QuickArrangement {
  return updateErase(qa, idx, (marks) => {
    if (marks.some((m) => m.k === "line" && m.b === b)) return marks
    if (marks.some((m) => m.k === "chord" && m.b === b && m.ci === ci)) {
      return marks.filter((m) => !(m.k === "chord" && m.b === b && m.ci === ci))
    }
    return [...marks, { k: "chord", b, line: lineOf(content, b), ci }]
  })
}

/**
 * Ratlla un tram de text; si ja estava tot ratllat, el recupera. Els trams d'una línia es
 * desen units (una marca per tram continu).
 */
export function toggleText(
  content: string,
  qa: QuickArrangement,
  idx: number,
  b: number,
  start: number,
  end: number,
): QuickArrangement {
  if (end <= start) return qa
  return updateErase(qa, idx, (marks) => {
    if (marks.some((m) => m.k === "line" && m.b === b)) return marks
    const current = marks.flatMap((m) => (m.k === "text" && m.b === b ? [{ start: m.start, end: m.end }] : []))
    const covered = mergeRanges(current).some((r) => r.start <= start && end <= r.end)
    let ranges: { start: number; end: number }[]
    if (covered) {
      ranges = current.flatMap((r) => {
        if (r.end <= start || r.start >= end) return [r]
        const parts: { start: number; end: number }[] = []
        if (r.start < start) parts.push({ start: r.start, end: start })
        if (r.end > end) parts.push({ start: end, end: r.end })
        return parts
      })
    } else {
      ranges = [...current, { start, end }]
    }
    const line = lineOf(content, b)
    const others = marks.filter((m) => !(m.k === "text" && m.b === b))
    return [...others, ...mergeRanges(ranges).map((r): EraseMark => ({ k: "text", b, line, ...r }))]
  })
}

/** Nombre d'acords d'una línia (per validar `ci`). */
export function chordCount(content: string, b: number): number {
  const block = parse(normalizeContent(content)).blocks[b]
  return block?.kind === "lyric" ? toLineModel(block.spans).chords.length : 0
}
