/**
 * src/lib/arrangement/render.ts — HTML del cos d'una secció a l'arranjador ràpid (§22).
 *
 * Mateix markup que el mode correcció dels reports (src/lib/reports/render.ts), perquè la
 * selecció per paraules (components/reports/selection.ts) hi funcioni igual:
 *   - `span.rp-line[data-b]`        línia (índex de bloc de l'original)
 *   - `span.rp-t[data-o]`           tros de text; `data-o` = offset dins la línia
 *   - `ch.rp-ch[data-b][data-ci]`   acord; `data-ci` = índex entre els acords de la línia
 *   - `span.qa-gutter[data-b]`      marge per ratllar el vers sencer
 *   - `.rp-del` / `.rp-old`         el que està esborrat (ratllat)
 * Pur.
 */

import type { Block, Doc } from "../editor/model"
import { toLineModel } from "../reports/apply"
import { escapeHtml } from "../reports/render"
import { respellAccidentals, transposeChord, type AccidentalMap } from "../transpose"
import { mergeRanges, type EraseMark, type Section } from "./apply"

export interface ArrangeRenderOptions {
  semitones: number
  notation: AccidentalMap
  /** Títol del marge (vers sencer). */
  lineTitle: string
}

/** Cos d'una secció (sense el títol), amb les marques de la instància ratllades. */
export function renderSectionBody(doc: Doc, section: Section, erase: EraseMark[], opts: ArrangeRenderOptions): string {
  const show = (chord: string) => escapeHtml(respellAccidentals(transposeChord(chord.trim(), opts.semitones), opts.notation))
  let a = 0
  let z = section.blocks.length
  while (a < z && doc.blocks[section.blocks[a]].kind === "empty") a++
  while (z > a && doc.blocks[section.blocks[z - 1]].kind === "empty") z--

  return section.blocks
    .slice(a, z)
    .map((b) => {
      const block: Block = doc.blocks[b]
      if (block.kind !== "lyric") return `<span class="rp-line rp-empty" data-b="${b}"></span>`
      const marks = erase.filter((m) => m.b === b)
      const lineOff = marks.some((m) => m.k === "line")
      const chordsOff = new Set(marks.flatMap((m) => (m.k === "chord" ? [m.ci] : [])))
      const ranges = mergeRanges(marks.flatMap((m) => (m.k === "text" ? [{ start: m.start, end: m.end }] : [])))
      const m = toLineModel(block.spans)
      const len = m.text.length

      const bounds = new Set<number>([0, len])
      m.chords.forEach((c) => bounds.add(Math.min(c.offset, len)))
      ranges.forEach((r) => {
        bounds.add(r.start)
        bounds.add(r.end)
      })
      const points = [...bounds].filter((p) => p >= 0 && p <= len).sort((x, y) => x - y)

      let html = `<span class="qa-gutter" data-b="${b}" title="${escapeHtml(opts.lineTitle)}"></span>`
      points.forEach((p, k) => {
        m.chords.forEach((c, ci) => {
          if (Math.min(c.offset, len) !== p) return
          const off = lineOff || chordsOff.has(ci)
          html += `<ch class="rp-ch" data-b="${b}" data-ci="${ci}"><span class="rp-chip${off ? " rp-old" : ""}">${show(c.chord)}</span></ch>`
        })
        const next = points[k + 1]
        if (next === undefined) return
        const text = m.text.slice(p, next)
        if (!text) return
        const del = lineOff || ranges.some((r) => r.start <= p && next <= r.end)
        html += `<span class="rp-t${del ? " rp-del" : ""}" data-o="${p}">${escapeHtml(text)}</span>`
      })
      return `<span class="rp-line${lineOff ? " is-erased" : ""}" data-b="${b}">${html}</span>`
    })
    .join("\n")
}
