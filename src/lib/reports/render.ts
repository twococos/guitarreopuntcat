/**
 * src/lib/reports/render.ts — HTML de la cançó en mode correcció.
 *
 * Fa servir les mateixes etiquetes <ch>/<sec> que la vista normal (l'aspecte no
 * canvia), però cada línia, tros de text i acord porta atributs per saber on
 * toca l'usuari, i les correccions es pinten a sobre:
 *   - `span.rp-line[data-b]`        una línia del content (índex de bloc)
 *   - `span.rp-t[data-o]`           tros de text; `data-o` = offset dins la línia
 *   - `ch.rp-ch[data-b][data-ci]`   acord; `data-ci` = índex dins la línia
 *   - `sec.rp-sec[data-b]`          títol de secció
 *   - `ins[data-item] .rp-it[data-o]` text afegit per l'ítem `data-item`
 *                                   (s'hi poden posar acords a sobre)
 *   - `.rp-old` / `.rp-del`         el que està malament (ratllat)
 *   - `.rp-new` / `.rp-ins`         la correcció
 *   - `[data-ri]`                   índex de l'ítem que ha fet la marca;
 *                                   `.rp-focus` si és l'ítem destacat
 * Pur: el fan servir el visor públic i l'admin.
 */

import { parse } from "@/lib/editor/model"
import { respellAccidentals, transposeChord, type AccidentalMap } from "@/lib/transpose"
import type { ReportItem } from "@/lib/schemas/report"
import { blockLine, resolveBlock, splitChords, toLineModel } from "./apply"

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

interface ChordMark {
  /** Acord nou (canvi) o null (sobra / s'ha mogut). */
  to: string | null
  ri: number
}

interface LineDeco {
  chordMarks: Map<number, ChordMark>
  added: { offset: number; chord: string; ri: number }[]
  edits: { start: number; end: number; to: string; ri: number }[]
  sectionTo: { name: string; ri: number } | null
  sectionRemoved: number | null
  before: string[]
  after: string[]
}

export interface RenderOptions {
  semitones: number
  notation: AccidentalMap
  /** Línia destacada (p. ex. on s'acaba de tocar). */
  highlightBlock?: number | null
  /** Acord destacat (p. ex. el que s'està movent). */
  highlightChord?: { block: number; idx: number } | null
  /** Ítem destacat (admin): les seves marques porten `.rp-focus`. */
  focusItem?: number | null
}

export function buildReportableHtml(content: string, items: ReportItem[], opts: RenderOptions): string {
  const doc = parse(content)
  const lines = doc.blocks.map(blockLine)
  const decos = new Map<number, LineDeco>()
  const show = (chord: string) => escapeHtml(respellAccidentals(transposeChord(chord, opts.semitones), opts.notation))
  /** Atributs comuns d'una marca de l'ítem `ri`. */
  const mark = (ri: number) => `data-ri="${ri}"`
  const focus = (ri: number) => (opts.focusItem === ri ? " rp-focus" : "")

  function deco(i: number): LineDeco {
    let d = decos.get(i)
    if (!d) {
      d = { chordMarks: new Map(), added: [], edits: [], sectionTo: null, sectionRemoved: null, before: [], after: [] }
      decos.set(i, d)
    }
    return d
  }

  /** Text afegit (amb els seus acords), on es poden tocar posicions. */
  const insText = (text: string, ri: number) => {
    const m = splitChords(text)
    let html = ""
    let pos = 0
    const flushTo = (end: number) => {
      if (end > pos) html += `<span class="rp-it" data-o="${pos}">${escapeHtml(m.text.slice(pos, end))}</span>`
      pos = Math.max(pos, end)
    }
    for (const c of m.chords) {
      flushTo(c.offset)
      html += `<ch class="rp-ch rp-added"><span class="rp-chip rp-new">${show(c.chord)}</span></ch>`
    }
    flushTo(m.text.length)
    return `<ins class="rp-ins${focus(ri)}" data-item="${ri}" ${mark(ri)}>${html}</ins>`
  }
  const insLine = (html: string) => `<span class="rp-line rp-ins-line">${html}</span>`
  const insSection = (name: string, ri: number) =>
    insLine(`<sec class="rp-sec rp-ins${focus(ri)}" ${mark(ri)}>${escapeHtml(name)}</sec>`)

  items.forEach((item, ri) => {
    if (!("block" in item)) return
    const b = resolveBlock(lines, item.block, item.line)
    if (b === null) return
    const d = deco(b)
    switch (item.kind) {
      case "chord_replace":
        d.chordMarks.set(item.chord_idx, { to: item.to, ri })
        break
      case "chord_remove":
        d.chordMarks.set(item.chord_idx, { to: null, ri })
        break
      case "chord_add":
        d.added.push({ offset: item.offset, chord: item.chord, ri })
        break
      case "chord_move": {
        d.chordMarks.set(item.chord_idx, { to: null, ri })
        const to = resolveBlock(lines, item.to_block, item.to_line)
        if (to !== null) deco(to).added.push({ offset: item.to_offset, chord: item.chord, ri })
        break
      }
      case "lyric_replace":
        d.edits.push({ start: item.start, end: item.end, to: item.to, ri })
        break
      case "lyric_add_line":
        d.after.push(insLine(insText(item.text, ri)))
        break
      case "section_rename":
        d.sectionTo = { name: item.to, ri }
        break
      case "section_remove":
        d.sectionRemoved = ri
        break
      case "section_add":
        d.before.push(insSection(item.name, ri))
        break
      case "section_missing": {
        let body: string[]
        if (item.copy_of) {
          const src = resolveBlock(lines, item.copy_of.block, item.copy_of.line)
          const s = src !== null ? doc.blocks[src] : null
          const name = s?.kind === "section" ? s.name : "?"
          body = [insLine(`<ins class="rp-ins rp-copy${focus(ri)}" ${mark(ri)}>= ${escapeHtml(name)}</ins>`)]
        } else {
          body = item.text
            .split("\n")
            .filter((t) => t.trim())
            .map((t) => insLine(`<ins class="rp-ins${focus(ri)}" ${mark(ri)}>${escapeHtml(t)}</ins>`))
        }
        const block = [insSection(item.name, ri), ...body]
        if (item.position === "after") d.after.push(...block)
        else d.before.push(...block)
        break
      }
    }
  })

  const out: string[] = []
  doc.blocks.forEach((block, i) => {
    const d = decos.get(i)
    if (d) out.push(...d.before)
    const hl = opts.highlightBlock === i ? " rp-hl" : ""

    if (block.kind === "empty") {
      out.push(`<span class="rp-line rp-empty${hl}" data-b="${i}"></span>`)
    } else if (block.kind === "section") {
      const name = escapeHtml(block.name)
      let inner = name
      let attrs = ""
      if (d?.sectionTo) {
        const ri = d.sectionTo.ri
        inner = `<span class="rp-del">${name}</span> <span class="rp-ins">${escapeHtml(d.sectionTo.name)}</span>`
        attrs = ` ${mark(ri)}`
      }
      let cls = d?.sectionTo ? focus(d.sectionTo.ri) : ""
      if (d?.sectionRemoved != null) {
        cls = ` rp-del${focus(d.sectionRemoved)}`
        attrs = ` ${mark(d.sectionRemoved)}`
      }
      out.push(`<span class="rp-line${hl}" data-b="${i}"><sec class="rp-sec${cls}" data-b="${i}"${attrs}>${inner}</sec></span>`)
    } else {
      out.push(`<span class="rp-line${hl}" data-b="${i}">${renderLyric(i, block.spans, d)}</span>`)
    }

    if (d) out.push(...d.after)
  })

  return out.join("\n")

  function renderLyric(b: number, spans: Parameters<typeof toLineModel>[0], d: LineDeco | undefined): string {
    const m = toLineModel(spans)
    const len = m.text.length
    const edits = d?.edits ?? []
    const added = d?.added ?? []

    const bounds = new Set<number>([0, len])
    m.chords.forEach((c) => bounds.add(Math.min(c.offset, len)))
    added.forEach((c) => bounds.add(Math.min(c.offset, len)))
    edits.forEach((e) => {
      bounds.add(e.start)
      bounds.add(e.end)
    })
    const points = [...bounds].filter((p) => p >= 0 && p <= len).sort((a, b) => a - b)

    let html = ""
    points.forEach((p, k) => {
      // Acords d'aquesta posició: els originals (amb la seva marca) i els afegits
      m.chords.forEach((c, ci) => {
        if (Math.min(c.offset, len) !== p) return
        const cm = d?.chordMarks.get(ci)
        const hl = opts.highlightChord?.block === b && opts.highlightChord.idx === ci ? " rp-hl" : ""
        let chips: string
        if (!cm) chips = `<span class="rp-chip">${show(c.chord)}</span>`
        else if (cm.to === null) chips = `<span class="rp-chip rp-old">${show(c.chord)}</span>`
        else chips = `<span class="rp-chip rp-old">${show(c.chord)}</span><span class="rp-chip rp-new">${show(cm.to)}</span>`
        const attrs = cm ? ` ${mark(cm.ri)}` : ""
        html += `<ch class="rp-ch${hl}${cm ? focus(cm.ri) : ""}" data-b="${b}" data-ci="${ci}"${attrs}>${chips}</ch>`
      })
      added.forEach((c) => {
        if (Math.min(c.offset, len) === p) {
          html += `<ch class="rp-ch rp-added${focus(c.ri)}" ${mark(c.ri)}><span class="rp-chip rp-new">${show(c.chord)}</span></ch>`
        }
      })

      // Insercions de text en aquest punt; i, si s'hi acaba un tram substituït, el text nou
      edits.forEach((e) => {
        if (e.start === e.end && e.start === p && e.to) html += insText(e.to, e.ri)
      })

      const next = points[k + 1]
      if (next === undefined) return
      const del = edits.find((e) => e.start < e.end && e.start <= p && next <= e.end)
      const text = m.text.slice(p, next)
      if (text) {
        html += del
          ? `<span class="rp-t rp-del${focus(del.ri)}" data-o="${p}" ${mark(del.ri)}>${escapeHtml(text)}</span>`
          : `<span class="rp-t" data-o="${p}">${escapeHtml(text)}</span>`
      }
      edits.forEach((e) => {
        if (e.start < e.end && e.end === next && e.to) html += insText(e.to, e.ri)
      })
    })
    return html
  }
}
