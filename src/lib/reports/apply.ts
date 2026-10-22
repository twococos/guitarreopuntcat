/**
 * src/lib/reports/apply.ts — Aplica correccions reportades al content d'una cançó.
 *
 * Pur (sense Node ni BD): l'usen l'API de l'admin i la previsualització.
 *
 * Cada ítem s'ancora a una línia del content original (`block` + `line`). Si la
 * línia ja no és al mateix índex, es busca la línia idèntica més propera; si no
 * n'hi ha cap, l'ítem falla amb `anchor` i l'admin l'ha de fer a l'editor.
 *
 * Totes les àncores es resolen contra el content actual ABANS de modificar-lo, i
 * els canvis es fan sobre un model per línia (text pla + acords a offsets), així
 * diversos ítems sobre la mateixa línia no s'interfereixen.
 */

import { parse, serialize, type Block, type Inline } from "@/lib/editor/model"
import { transposeChord, transposeContent } from "@/lib/transpose"
import type { MetaField, ReportItem } from "@/lib/schemas/report"

export type ApplyFailReason = "anchor" | "mismatch" | "conflict" | "manual"

export interface ApplyResult {
  content: string
  applied: number[]
  failed: { id: number; reason: ApplyFailReason }[]
  /** Camps de metadades a canviar (`meta`), ja com a text. */
  meta: Partial<Record<Exclude<MetaField, "youtube_broken">, string>>
  /** Semitons a transposar (`song_key`); el content ja els porta aplicats. */
  keyShift: number
}

/* ── Model per línia ─────────────────────────────────────── */

interface LineChord {
  offset: number
  chord: string
  removed?: boolean
}

export interface LineModel {
  text: string
  chords: LineChord[]
}

/** Text cru d'un bloc, tal com és a la BD. */
export function blockLine(block: Block): string {
  return serialize({ blocks: [block] })
}

/** Línia de lletra → text pla + acords amb l'offset del caràcter on cauen. */
export function toLineModel(spans: Inline[]): LineModel {
  let text = ""
  const chords: LineChord[] = []
  for (const s of spans) {
    if (s.kind === "text") text += s.text
    else chords.push({ offset: text.length, chord: s.chord })
  }
  return { text, chords }
}

export function fromLineModel(m: LineModel): Inline[] {
  // sort és estable: els acords al mateix offset conserven l'ordre
  const chords = m.chords.filter((c) => !c.removed).sort((a, b) => a.offset - b.offset)
  const spans: Inline[] = []
  let pos = 0
  for (const c of chords) {
    const at = Math.min(Math.max(c.offset, 0), m.text.length)
    if (at > pos) spans.push({ kind: "text", text: m.text.slice(pos, at) })
    spans.push({ kind: "chord", chord: c.chord })
    pos = Math.max(pos, at)
  }
  if (pos < m.text.length) spans.push({ kind: "text", text: m.text.slice(pos) })
  return spans
}

/**
 * Índex actual d'una línia reportada: el mateix si encara hi és, si no la línia
 * idèntica més propera, o null si ja no existeix.
 */
export function resolveBlock(lines: string[], block: number, line: string): number | null {
  if (lines[block] === line) return block
  let best: number | null = null
  lines.forEach((l, i) => {
    if (l === line && (best === null || Math.abs(i - block) < Math.abs(best - block))) best = i
  })
  return best
}

/** Acord en sostinguts (la BD els desa així). */
export function normalizeChord(chord: string): string {
  return transposeChord(chord.trim(), 0)
}

/** El text que escriu l'usuari no pot portar tags. */
function plain(text: string): string {
  return text.replace(/[<>]/g, "")
}

const CHORD_RE = /^[A-G][#b]?[^\s<>/]{0,10}(\/[A-G][#b]?)?$/

/**
 * Text nou d'un ítem de lletra (`lyric_replace.to`, `lyric_add_line.text`):
 * pot portar acords (`<ch>X</ch>`) que l'usuari hi ha posat a sobre. Es
 * conserven els acords vàlids i es treu qualsevol altre tag.
 */
export function sanitizeInline(text: string): string {
  return text.replace(/<ch>([^<>]{0,16})<\/ch>|<[^<>]*>|[<>]/g, (_m, c: string | undefined) =>
    c !== undefined && CHORD_RE.test(c.trim()) ? `<ch>${c.trim()}</ch>` : "",
  )
}

/** Text amb `<ch>` → text pla + acords a offsets (com una línia de lletra). */
export function splitChords(text: string): LineModel {
  const spans: Inline[] = []
  for (const m of sanitizeInline(text).matchAll(/<ch>([^<]*)<\/ch>|([^<]+)/g)) {
    if (m[1] !== undefined) spans.push({ kind: "chord", chord: m[1] })
    else if (m[2] !== undefined) spans.push({ kind: "text", text: m[2] })
  }
  return toLineModel(spans)
}

/** Posa un acord al text (amb o sense `<ch>`) a l'offset de text pla `offset`. */
export function insertChordInText(text: string, offset: number, chord: string): string {
  const m = splitChords(text)
  m.chords.push({ offset: Math.min(Math.max(offset, 0), m.text.length), chord })
  return fromLineModel(m)
    .map((s) => (s.kind === "chord" ? `<ch>${s.chord}</ch>` : s.text))
    .join("")
}

/* ── Aplicació ───────────────────────────────────────────── */

interface TextEdit {
  start: number
  end: number
  to: string
}

interface BlockState {
  model: LineModel | null
  edits: TextEdit[]
  removed: boolean
  renamed: string | null
  before: Block[]
  after: Block[]
}

export function applyReportItems(
  content: string,
  items: { id: number; item: ReportItem }[],
): ApplyResult {
  const doc = parse(content)
  const lines = doc.blocks.map(blockLine)
  const states = new Map<number, BlockState>()
  const result: ApplyResult = { content, applied: [], failed: [], meta: {}, keyShift: 0 }

  const resolve = (block: number, line: string) => resolveBlock(lines, block, line)

  function state(i: number): BlockState {
    let s = states.get(i)
    if (!s) {
      const b = doc.blocks[i]
      s = {
        model: b?.kind === "lyric" ? toLineModel(b.spans) : null,
        edits: [],
        removed: false,
        renamed: null,
        before: [],
        after: [],
      }
      states.set(i, s)
    }
    return s
  }

  /** Acord viu `idx` d'una línia de lletra, si coincideix amb l'esperat. */
  function liveChord(i: number, idx: number, expected: string): LineChord | ApplyFailReason {
    const m = state(i).model
    const c = m?.chords[idx]
    if (!c) return "mismatch"
    if (c.removed) return "conflict"
    if (normalizeChord(c.chord) !== normalizeChord(expected)) return "mismatch"
    return c
  }

  for (const { id, item } of items) {
    const fail = (reason: ApplyFailReason) => result.failed.push({ id, reason })

    switch (item.kind) {
      case "chord_replace": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        const c = liveChord(b, item.chord_idx, item.from)
        if (typeof c === "string") { fail(c); break }
        if (item.scope === "all") {
          const from = normalizeChord(item.from)
          doc.blocks.forEach((blk, i) => {
            if (blk.kind !== "lyric") return
            for (const ch of state(i).model?.chords ?? []) {
              if (!ch.removed && normalizeChord(ch.chord) === from) ch.chord = item.to
            }
          })
        } else {
          c.chord = item.to
        }
        result.applied.push(id)
        break
      }

      case "chord_remove": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        const c = liveChord(b, item.chord_idx, item.chord)
        if (typeof c === "string") { fail(c); break }
        c.removed = true
        result.applied.push(id)
        break
      }

      case "chord_add": {
        const b = resolve(item.block, item.line)
        const m = b === null ? null : state(b).model
        if (!m) { fail("anchor"); break }
        m.chords.push({ offset: Math.min(item.offset, m.text.length), chord: item.chord })
        result.applied.push(id)
        break
      }

      case "chord_move": {
        const b = resolve(item.block, item.line)
        const to = resolve(item.to_block, item.to_line)
        const dest = to === null ? null : state(to).model
        if (b === null || !dest) { fail("anchor"); break }
        const c = liveChord(b, item.chord_idx, item.chord)
        if (typeof c === "string") { fail(c); break }
        c.removed = true
        dest.chords.push({ offset: Math.min(item.to_offset, dest.text.length), chord: c.chord })
        result.applied.push(id)
        break
      }

      case "song_key":
        result.keyShift = (result.keyShift + item.semitones) % 12
        result.applied.push(id)
        break

      case "lyric_replace": {
        const b = resolve(item.block, item.line)
        const s = b === null ? null : state(b)
        if (!s?.model) { fail("anchor"); break }
        if (item.end < item.start || s.model.text.slice(item.start, item.end) !== item.from) {
          fail("mismatch")
          break
        }
        const overlaps = s.edits.some((e) => overlap(e, item))
        if (overlaps) { fail("conflict"); break }
        s.edits.push({ start: item.start, end: item.end, to: item.to })
        result.applied.push(id)
        break
      }

      case "lyric_add_line": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        state(b).after.push({ kind: "lyric", spans: fromLineModel(splitChords(item.text)) })
        result.applied.push(id)
        break
      }

      case "section_rename":
      case "section_remove": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        const s = state(b)
        if (doc.blocks[b].kind !== "section" || s.removed || s.renamed !== null) { fail("conflict"); break }
        if (item.kind === "section_rename") s.renamed = plain(item.to)
        else s.removed = true
        result.applied.push(id)
        break
      }

      case "section_add": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        state(b).before.push({ kind: "section", name: plain(item.name) })
        result.applied.push(id)
        break
      }

      case "section_missing": {
        const b = resolve(item.block, item.line)
        if (b === null) { fail("anchor"); break }
        let body: Block[]
        if (item.copy_of) {
          const src = resolve(item.copy_of.block, item.copy_of.line)
          if (src === null || doc.blocks[src].kind !== "section") { fail("anchor"); break }
          body = sectionBody(doc.blocks, src)
        } else {
          body = plain(item.text)
            .split("\n")
            .map((t): Block => (t.trim() ? { kind: "lyric", spans: [{ kind: "text", text: t }] } : { kind: "empty" }))
        }
        const header: Block = { kind: "section", name: plain(item.name) }
        if (item.position === "after") state(b).after.push({ kind: "empty" }, header, ...body)
        else state(b).before.push(header, ...body, { kind: "empty" })
        result.applied.push(id)
        break
      }

      case "meta":
        if (item.field === "youtube_broken") { fail("manual"); break }
        result.meta[item.field] = item.to.trim()
        result.applied.push(id)
        break

      case "lyric_version":
      case "other":
        fail("manual")
        break
    }
  }

  const blocks: Block[] = []
  doc.blocks.forEach((block, i) => {
    const s = states.get(i)
    if (!s) {
      blocks.push(block)
      return
    }
    blocks.push(...s.before)
    if (!s.removed) {
      if (s.model) {
        applyTextEdits(s.model, s.edits)
        blocks.push({ kind: "lyric", spans: fromLineModel(s.model) })
      } else if (s.renamed !== null) {
        blocks.push({ kind: "section", name: s.renamed })
      } else {
        blocks.push(block)
      }
    }
    blocks.push(...s.after)
  })

  let out = serialize({ blocks })
  if (result.keyShift) out = transposeContent(out, result.keyShift)
  result.content = out
  return result
}

/** Línies d'una secció (sense el títol ni les línies buides del final). */
function sectionBody(blocks: Block[], header: number): Block[] {
  const body: Block[] = []
  for (let i = header + 1; i < blocks.length && blocks[i].kind !== "section"; i++) body.push(blocks[i])
  while (body.length && body[body.length - 1].kind === "empty") body.pop()
  return body
}

/** Dues edicions de la mateixa línia es trepitgen (dues insercions al mateix punt, no). */
function overlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  if (a.start === a.end && b.start === b.end) return false
  if (a.start === a.end) return b.start < a.start && a.start < b.end
  if (b.start === b.end) return a.start < b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

/**
 * Aplica les substitucions de text d'una línia, de dreta a esquerra perquè els
 * offsets originals continuïn valent. Els acords posteriors es desplacen; els
 * que queien dins el tram substituït es queden dins el text nou.
 */
function applyTextEdits(m: LineModel, edits: TextEdit[]): void {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  for (const e of sorted) {
    // El text nou pot portar els seus propis acords
    const ins = splitChords(e.to)
    const delta = ins.text.length - (e.end - e.start)
    m.text = m.text.slice(0, e.start) + ins.text + m.text.slice(e.end)
    for (const c of m.chords) {
      if (c.offset >= e.end) c.offset += delta
      else if (c.offset > e.start) c.offset = e.start + Math.min(c.offset - e.start, ins.text.length)
    }
    for (const c of ins.chords) m.chords.push({ offset: e.start + c.offset, chord: c.chord })
  }
}
