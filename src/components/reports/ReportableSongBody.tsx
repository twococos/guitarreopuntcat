"use client"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getT } from "@/lib/i18n"
import { parse, type Block } from "@/lib/editor/model"
import { getSectionType } from "@/lib/editor/sections"
import { blockLine, insertChordInText, normalizeChord, toLineModel } from "@/lib/reports/apply"
import { buildReportableHtml } from "@/lib/reports/render"
import { respellAccidentals, transposeChord, type AccidentalMap } from "@/lib/transpose"
import type { ReportItem } from "@/lib/schemas/report"
import { IconChevronLeft, IconX } from "@/components/shared/Icons"
import { ChordPicker, ReportPopover, SectionPicker, TextPicker } from "./ReportPopovers"
import type { MarkKind, SongReport } from "./useSongReport"

interface Pos {
  block: number
  offset: number
  /** Posició dins el text que ha afegit l'ítem `item` d'aquest report (no és al content). */
  ins?: { item: number; offset: number }
}

/** Afegeix un acord al text nou d'un ítem de lletra (si en té). */
function withChord(item: ReportItem, offset: number, chord: string): ReportItem {
  if (item.kind === "lyric_replace") return { ...item, to: insertChordInText(item.to, offset, chord) }
  if (item.kind === "lyric_add_line") return { ...item, text: insertChordInText(item.text, offset, chord) }
  return item
}

interface Sel {
  block: number
  start: number
  end: number
  text: string
}

type Popover =
  | { type: "chordReplace"; x: number; y: number; block: number; ci: number; chord: string }
  | { type: "chordAdd"; x: number; y: number; pos: Pos }
  | { type: "lyricFix"; x: number; y: number; sel: Sel }
  | { type: "lyricMissing"; x: number; y: number; pos: Pos }
  | { type: "lyricLine"; x: number; y: number; block: number }
  | { type: "sectionRename"; x: number; y: number; block: number; name: string }
  | { type: "sectionAdd"; x: number; y: number; block: number }
  | { type: "sectionMissing"; x: number; y: number; block: number; position: "before" | "after" }
  | { type: "sectionMissingBody"; x: number; y: number; block: number; position: "before" | "after"; name: string }

const DRAG_THRESHOLD = 5
const WORD_CHAR = /[\p{L}\p{N}'’·-]/u

/** Modes en què es toquen acords, se selecciona lletra o es toquen títols de secció. */
const CHORD_MODES: readonly MarkKind[] = ["chord_wrong", "chord_extra", "chord_move"]
const TEXT_MODES: readonly MarkKind[] = ["lyric_fix", "lyric_extra"]
const SECTION_MODES: readonly MarkKind[] = ["section_rename", "section_remove"]
/** Modes en què un cursor segueix el ratolí per marcar on aniria la cosa nova. */
const CARET_MODES: readonly MarkKind[] = ["chord_missing", "lyric_missing"]

/**
 * Cursor (en coordenades del contenidor) a una posició de text: la vora
 * esquerra del caràcter que hi ha a l'offset, o la dreta de l'últim si és al
 * final. Si la línia no té text, al principi de la línia.
 */
function caretBox(wrap: HTMLElement, pos: Pos) {
  const origin = wrap.getBoundingClientRect()
  const selector = pos.ins
    ? `ins[data-item="${pos.ins.item}"] .rp-it`
    : `.rp-line[data-b="${pos.block}"] .rp-t`
  const offset = pos.ins ? pos.ins.offset : pos.offset
  let fallback: { left: number; top: number; height: number } | null = null
  for (const t of wrap.querySelectorAll<HTMLElement>(selector)) {
    const node = t.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE) continue
    const o = Number(t.dataset.o)
    const len = node.textContent?.length ?? 0
    if (offset < o || offset > o + len || len === 0) continue
    const r = document.createRange()
    const atEnd = offset === o + len
    r.setStart(node, atEnd ? len - 1 : offset - o)
    r.setEnd(node, atEnd ? len : offset - o + 1)
    const rect = [...r.getClientRects()].find((c) => c.width > 0)
    if (!rect) continue
    const box = { left: (atEnd ? rect.right : rect.left) - origin.left, top: rect.top - origin.top, height: rect.height }
    if (!atEnd) return box
    fallback = box
  }
  if (fallback) return fallback
  const line = pos.ins
    ? wrap.querySelector<HTMLElement>(`ins[data-item="${pos.ins.item}"]`)
    : wrap.querySelector<HTMLElement>(`.rp-line[data-b="${pos.block}"]`)
  if (!line) return null
  const r = line.getBoundingClientRect()
  return { left: r.left - origin.left, top: r.top - origin.top, height: r.height || 16 }
}

/**
 * Què es veu en color a cada mode. La resta queda en gris, i les correccions
 * (vermell ratllat / verd) sempre destaquen.
 */
const EMPHASIS: Record<MarkKind, ("chords" | "lyrics" | "sections")[]> = {
  chord_wrong: ["chords"],
  chord_extra: ["chords"],
  chord_move: ["chords"],
  chord_missing: ["chords", "lyrics"],
  lyric_fix: ["lyrics"],
  lyric_extra: ["lyrics"],
  lyric_missing: ["lyrics"],
  lyric_line: ["lyrics"],
  section_rename: ["sections"],
  section_remove: ["sections"],
  section_add: ["sections", "lyrics"],
  section_missing: ["sections", "lyrics"],
}

/**
 * Caixetes de la selecció de lletra, en coordenades del contenidor: una per
 * línia visual (una línia de la cançó pot ocupar-ne més d'una en pantalla).
 * Només es mesuren els trossos de text, no els acords que hi ha a sobre.
 */
function selectionBoxes(wrap: HTMLElement, sel: Sel) {
  const origin = wrap.getBoundingClientRect()
  const rects: DOMRect[] = []
  for (const t of wrap.querySelectorAll<HTMLElement>(`.rp-line[data-b="${sel.block}"] .rp-t`)) {
    const node = t.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE) continue
    const o = Number(t.dataset.o)
    const s = Math.max(sel.start, o)
    const e = Math.min(sel.end, o + (node.textContent?.length ?? 0))
    if (s >= e) continue
    const r = document.createRange()
    r.setStart(node, s - o)
    r.setEnd(node, e - o)
    for (const cr of r.getClientRects()) if (cr.width > 0.5) rects.push(cr)
  }
  const lines: { left: number; right: number; top: number; bottom: number }[] = []
  for (const r of rects) {
    const l = lines.find((b) => Math.abs(b.top - r.top) < r.height / 2)
    if (l) {
      l.left = Math.min(l.left, r.left)
      l.right = Math.max(l.right, r.right)
      l.bottom = Math.max(l.bottom, r.bottom)
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
    }
  }
  return lines.map((b) => ({
    left: b.left - origin.left - 3,
    top: b.top - origin.top - 1,
    width: b.right - b.left + 6,
    height: b.bottom - b.top + 2,
  }))
}

/**
 * Cos de la cançó en mode correcció. Mostra les correccions ja afegides i
 * converteix cada toc, selecció o arrossegament en un ítem de report sobre el
 * content original (vegeu src/lib/reports/render.ts per als atributs).
 */
export function ReportableSongBody({
  report,
  content,
  semitones,
  notation,
  displayKey,
}: {
  report: SongReport
  content: string
  semitones: number
  notation: AccidentalMap
  /** To que es veu, en sostinguts. */
  displayKey: string
}) {
  const t = getT().public.report
  const mode = report.marking
  const rootRef = useRef<HTMLDivElement>(null)
  const [popover, setPopover] = useState<Popover | null>(null)
  const [moveSource, setMoveSource] = useState<{ block: number; ci: number; chord: string } | null>(null)
  const [pendingSel, setPendingSel] = useState<Sel | null>(null)
  const drag = useRef<{
    x: number
    y: number
    block: number
    ci: number
    chord: string
    target: Element
    ghost: HTMLElement | null
  } | null>(null)

  const doc = useMemo(() => parse(content), [content])
  const lines = useMemo(() => doc.blocks.map(blockLine), [doc])

  // Canviar de tipus d'error neteja el que estava a mitges
  useEffect(() => {
    setPopover(null)
    setMoveSource(null)
    setPendingSel(null)
    setCaret(null)
  }, [mode])

  const html = useMemo(
    () =>
      buildReportableHtml(content, report.items, {
        semitones,
        notation,
        highlightBlock: popover && "block" in popover ? popover.block : popover && "pos" in popover ? popover.pos.block : null,
        highlightChord: moveSource
          ? { block: moveSource.block, idx: moveSource.ci }
          : popover?.type === "chordReplace"
            ? { block: popover.block, idx: popover.ci }
            : null,
      }),
    [content, report.items, semitones, notation, popover, moveSource],
  )

  /* ── Conversions ─────────────────────────────────────────── */

  const display = useCallback(
    (chord: string) => respellAccidentals(transposeChord(chord, semitones), notation),
    [semitones, notation],
  )
  /** Acord triat (to que es veu, sostinguts) → to original. */
  const toOriginal = useCallback((chord: string) => normalizeChord(transposeChord(chord, -semitones)), [semitones])

  const lyric = useCallback(
    (block: number) => {
      const b: Block | undefined = doc.blocks[block]
      return b?.kind === "lyric" ? toLineModel(b.spans) : null
    },
    [doc],
  )

  /** Posició de text (línia + offset) d'un node del DOM. */
  const locate = useCallback(
    (node: Node, nodeOffset: number): Pos | null => {
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
      if (!el || !rootRef.current?.contains(el)) return null
      // Text afegit per un ítem del report (s'hi poden posar acords)
      const insEl = el.closest<HTMLElement>("ins[data-item]")
      if (insEl) {
        const itEl = el.closest<HTMLElement>(".rp-it")
        const inText = itEl && node.nodeType === Node.TEXT_NODE ? nodeOffset : 0
        return { block: -1, offset: 0, ins: { item: Number(insEl.dataset.item), offset: Number(itEl?.dataset.o ?? 0) + inText } }
      }
      const lineEl = el.closest<HTMLElement>(".rp-line[data-b]")
      if (!lineEl) return null
      const block = Number(lineEl.dataset.b)
      const m = lyric(block)
      if (!m) return { block, offset: 0 }
      const tEl = el.closest<HTMLElement>(".rp-t")
      if (tEl) {
        const inText = node.nodeType === Node.TEXT_NODE ? nodeOffset : 0
        return { block, offset: Number(tEl.dataset.o) + inText }
      }
      const chEl = el.closest<HTMLElement>("ch[data-ci]")
      if (chEl) return { block, offset: m.chords[Number(chEl.dataset.ci)]?.offset ?? 0 }
      // Tocat a la línia però fora del text: al principi o al final
      return { block, offset: nodeOffset === 0 ? 0 : m.text.length }
    },
    [lyric],
  )

  const posFromPoint = useCallback(
    (x: number, y: number): Pos | null => {
      const d = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
      }
      if (d.caretPositionFromPoint) {
        const p = d.caretPositionFromPoint(x, y)
        return p ? locate(p.offsetNode, p.offset) : null
      }
      const r = d.caretRangeFromPoint?.(x, y)
      return r ? locate(r.startContainer, r.startOffset) : null
    },
    [locate],
  )

  /** Paraula sota una posició. */
  const wordAt = useCallback(
    (pos: Pos): Sel | null => {
      const m = lyric(pos.block)
      if (!m) return null
      let start = Math.min(pos.offset, m.text.length)
      let end = start
      while (start > 0 && WORD_CHAR.test(m.text[start - 1])) start--
      while (end < m.text.length && WORD_CHAR.test(m.text[end])) end++
      if (start === end) return null
      return { block: pos.block, start, end, text: m.text.slice(start, end) }
    },
    [lyric],
  )

  /** Selecció de la paraula `a` fins a la `b` (mateixa línia). */
  const spanSel = useCallback(
    (a: Sel, b: Sel): Sel => {
      const start = Math.min(a.start, b.start)
      const end = Math.max(a.end, b.end)
      return { block: a.block, start, end, text: lyric(a.block)?.text.slice(start, end) ?? "" }
    },
    [lyric],
  )

  /*
   * Selecció de lletra pròpia (no la del navegador): es clica una paraula i
   * s'arrossega; les paraules entre totes dues queden dins una caixeta que
   * creix amb una animació. En tàctil, es toca la primera i després l'última.
   */
  const wrapRef = useRef<HTMLDivElement>(null)
  const textDrag = useRef<{ anchor: Sel; sel: Sel } | null>(null)
  const [selBoxes, setSelBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!pendingSel || !wrap) {
      setSelBoxes([])
      return
    }
    setSelBoxes(selectionBoxes(wrap, pendingSel))
  }, [pendingSel, html])

  /*
   * Cursor que marca on aniria el text que falta o l'acord (en passar el
   * ratolí, en arrossegar un acord i mentre el popover és obert).
   */
  const [caret, setCaret] = useState<Pos | null>(null)
  const [caretBoxState, setCaretBoxState] = useState<{ left: number; top: number; height: number } | null>(null)
  const updateCaret = useCallback(
    (pos: Pos | null) => {
      // Només posicions vàlides per al mode: text que falta, només a la lletra original
      const valid = pos && (pos.ins ? mode !== "lyric_missing" : lyric(pos.block) !== null) ? pos : null
      setCaret((prev) =>
        prev?.block === valid?.block && prev?.offset === valid?.offset && prev?.ins?.item === valid?.ins?.item && prev?.ins?.offset === valid?.ins?.offset
          ? prev
          : valid,
      )
    },
    [mode, lyric],
  )
  const shownCaret = popover && "pos" in popover ? popover.pos : caret
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    setCaretBoxState(shownCaret && wrap ? caretBox(wrap, shownCaret) : null)
  }, [shownCaret, html])

  /* ── Crear ítems ─────────────────────────────────────────── */

  const add = useCallback(
    (item: ReportItem) => {
      setPopover(null)
      setMoveSource(null)
      setPendingSel(null)
      report.addItem(item)
    },
    [report],
  )

  /** Treu els estats a mitges i passa a la llista (després de modificar ítems). */
  const editItems = useCallback(
    (fn: (items: ReportItem[]) => ReportItem[]) => {
      setPopover(null)
      setMoveSource(null)
      setPendingSel(null)
      report.editItems(fn)
    },
    [report],
  )

  /** Posa un acord nou a una posició: de la lletra original o de la que s'ha afegit. */
  const addChordAt = useCallback(
    (pos: Pos, chord: string) => {
      const ins = pos.ins
      if (ins) editItems((items) => items.map((it, i) => (i === ins.item ? withChord(it, ins.offset, chord) : it)))
      else add({ kind: "chord_add", block: pos.block, line: lines[pos.block], offset: pos.offset, chord })
    },
    [add, editItems, lines],
  )

  /**
   * Mou un acord de la cançó a una posició. Si el destí és lletra afegida, és
   * «sobra aquí» + l'acord dins el text nou d'aquell ítem.
   */
  const moveChordTo = useCallback(
    (src: { block: number; ci: number; chord: string }, pos: Pos) => {
      const ins = pos.ins
      if (ins) {
        editItems((items) => [
          ...items.map((it, i) => (i === ins.item ? withChord(it, ins.offset, src.chord) : it)),
          { kind: "chord_remove", block: src.block, line: lines[src.block], chord_idx: src.ci, chord: src.chord },
        ])
      } else if (lyric(pos.block)) {
        add({
          kind: "chord_move",
          block: src.block,
          line: lines[src.block],
          chord_idx: src.ci,
          chord: src.chord,
          to_block: pos.block,
          to_line: lines[pos.block],
          to_offset: pos.offset,
        })
      } else {
        setMoveSource(null)
      }
    },
    [add, editItems, lines, lyric],
  )

  const confirmSelection = useCallback(
    (sel: Sel, x: number, y: number) => {
      if (mode === "lyric_extra") {
        add({ kind: "lyric_replace", block: sel.block, line: lines[sel.block], start: sel.start, end: sel.end, from: sel.text, to: "" })
      } else {
        setPopover({ type: "lyricFix", x, y, sel })
      }
    },
    [mode, add, lines],
  )

  /* ── Tocs ────────────────────────────────────────────────── */

  const handleTap = useCallback(
    (target: Element, x: number, y: number, pointerType: string) => {
      if (!mode) return
      const chEl = target.closest<HTMLElement>("ch[data-ci]")
      const secEl = target.closest<HTMLElement>("sec[data-b]")
      const lineEl = target.closest<HTMLElement>(".rp-line[data-b]")
      const chordAt = () => {
        if (!chEl) return null
        const block = Number(chEl.dataset.b)
        const ci = Number(chEl.dataset.ci)
        const chord = lyric(block)?.chords[ci]?.chord
        const r = chEl.getBoundingClientRect()
        return chord === undefined ? null : { block, ci, chord, x: r.left, y: r.top + 4 }
      }

      switch (mode) {
        case "chord_wrong": {
          const c = chordAt()
          if (c) setPopover({ type: "chordReplace", x: c.x, y: c.y, block: c.block, ci: c.ci, chord: c.chord })
          break
        }
        case "chord_extra": {
          const c = chordAt()
          if (c) add({ kind: "chord_remove", block: c.block, line: lines[c.block], chord_idx: c.ci, chord: c.chord })
          break
        }
        case "chord_move": {
          const c = chordAt()
          if (!moveSource) {
            if (c) setMoveSource({ block: c.block, ci: c.ci, chord: c.chord })
            break
          }
          if (c && c.block === moveSource.block && c.ci === moveSource.ci) {
            setMoveSource(null)
            break
          }
          const pos = posFromPoint(x, y)
          if (pos) moveChordTo(moveSource, pos)
          break
        }
        case "chord_missing": {
          const pos = posFromPoint(x, y)
          if (pos && (pos.ins || lyric(pos.block))) setPopover({ type: "chordAdd", x, y, pos })
          break
        }
        case "lyric_missing": {
          const pos = posFromPoint(x, y)
          if (pos && !pos.ins && lyric(pos.block)) setPopover({ type: "lyricMissing", x, y, pos })
          break
        }
        case "lyric_fix":
        case "lyric_extra": {
          // Tàctil (el ratolí ho fa a onPointerDown/Move/Up): el primer toc agafa
          // una paraula; un toc a una altra de la mateixa línia hi estén la selecció
          const pos = posFromPoint(x, y)
          const word = pos ? wordAt(pos) : null
          if (!word) break
          const inside = pendingSel && word.start >= pendingSel.start && word.end <= pendingSel.end
          setPendingSel(pendingSel && pendingSel.block === word.block && !inside ? spanSel(pendingSel, word) : word)
          break
        }
        case "lyric_line":
          if (lineEl) setPopover({ type: "lyricLine", x, y, block: Number(lineEl.dataset.b) })
          break
        case "section_rename":
          if (secEl) {
            const block = Number(secEl.dataset.b)
            const b = doc.blocks[block]
            if (b?.kind === "section") setPopover({ type: "sectionRename", x, y, block, name: b.name })
          }
          break
        case "section_remove":
          if (secEl) {
            const block = Number(secEl.dataset.b)
            const b = doc.blocks[block]
            if (b?.kind === "section") add({ kind: "section_remove", block, line: lines[block], name: b.name })
          }
          break
        case "section_add":
          if (lineEl && lyric(Number(lineEl.dataset.b))) setPopover({ type: "sectionAdd", x, y, block: Number(lineEl.dataset.b) })
          break
        case "section_missing":
          if (lineEl) setPopover({ type: "sectionMissing", x, y, block: Number(lineEl.dataset.b), position: "before" })
          break
      }
    },
    [mode, lyric, lines, doc, add, moveSource, moveChordTo, posFromPoint, wordAt, pendingSel, spanSel],
  )

  /* ── Punter: toc, arrossegament d'acord o selecció de lletra ─ */

  function onPointerDown(e: React.PointerEvent) {
    if (mode && TEXT_MODES.includes(mode) && e.pointerType !== "touch") {
      const pos = posFromPoint(e.clientX, e.clientY)
      const word = pos ? wordAt(pos) : null
      if (!word) return
      e.preventDefault()
      textDrag.current = { anchor: word, sel: word }
      setPendingSel(word)
      rootRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (mode !== "chord_move" || moveSource) return
    const chEl = (e.target as Element).closest<HTMLElement>("ch[data-ci]")
    if (!chEl) return
    const block = Number(chEl.dataset.b)
    const ci = Number(chEl.dataset.ci)
    const chord = lyric(block)?.chords[ci]?.chord
    if (chord === undefined) return
    drag.current = { x: e.clientX, y: e.clientY, block, ci, chord, target: chEl, ghost: null }
    rootRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const td = textDrag.current
    if (td) {
      const pos = posFromPoint(e.clientX, e.clientY)
      const word = pos && pos.block === td.anchor.block ? wordAt(pos) : null
      if (word) {
        const sel = spanSel(td.anchor, word)
        if (sel.start !== td.sel.start || sel.end !== td.sel.end) {
          td.sel = sel
          setPendingSel(sel)
        }
      }
      return
    }
    const d = drag.current
    if (!d) {
      // Sense arrossegar: el cursor segueix el ratolí on aniria el text o l'acord
      if (e.pointerType === "mouse" && mode && (CARET_MODES.includes(mode) || (mode === "chord_move" && moveSource))) {
        updateCaret(posFromPoint(e.clientX, e.clientY))
      }
      return
    }
    if (d.ghost) updateCaret(posFromPoint(e.clientX, e.clientY))
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return
      const g = document.createElement("div")
      g.className = "rp-drag-ghost"
      g.textContent = display(d.chord)
      document.body.appendChild(g)
      d.ghost = g
      setMoveSource({ block: d.block, ci: d.ci, chord: d.chord })
    }
    // L'acord queda just a sobre del dit: on es deixa anar, hi va l'acord
    d.ghost.style.left = `${e.clientX}px`
    d.ghost.style.top = `${e.clientY}px`
  }

  function onPointerUp(e: React.PointerEvent) {
    const td = textDrag.current
    if (td) {
      // En deixar anar, la selecció ja és deliberada
      textDrag.current = null
      confirmSelection(td.sel, e.clientX, e.clientY)
      return
    }
    const d = drag.current
    drag.current = null
    if (d?.ghost) {
      d.ghost.remove()
      setCaret(null)
      const pos = posFromPoint(e.clientX, e.clientY)
      if (pos) moveChordTo(d, pos)
      else setMoveSource(null)
      return
    }
    // Amb el punter capturat, e.target és l'arrel: el destí bo és on ha començat
    handleTap(d ? d.target : (e.target as Element), e.clientX, e.clientY, e.pointerType)
  }

  /* ── Render ──────────────────────────────────────────────── */

  const chordCount = (chord: string) => {
    const n = normalizeChord(chord)
    let count = 0
    for (const b of doc.blocks) if (b.kind === "lyric") for (const s of b.spans) if (s.kind === "chord" && normalizeChord(s.chord) === n) count++
    return count
  }

  const sectionSources = useMemo(() => {
    const seen = new Set<string>()
    const out: { block: number; name: string }[] = []
    doc.blocks.forEach((b, i) => {
      if (b.kind === "section" && !seen.has(b.name)) {
        seen.add(b.name)
        out.push({ block: i, name: b.name })
      }
    })
    return out
  }, [doc])

  const lastBlock = useMemo(() => {
    for (let i = doc.blocks.length - 1; i >= 0; i--) if (doc.blocks[i].kind !== "empty") return i
    return 0
  }, [doc])

  /** Seccions que es poden copiar: les del mateix tipus o, si no n'hi ha, totes. */
  const copySources = (name: string) => {
    const same = sectionSources.filter((s) => getSectionType(s.name) === getSectionType(name))
    return same.length ? same : sectionSources
  }

  const closePopover = useCallback(() => {
    setPopover(null)
    setPendingSel(null)
  }, [])

  // Com es toca (cursor, què és clicable) i què es veu en color (la resta, en gris)
  const modeClass = mode
    ? CHORD_MODES.includes(mode)
      ? " rp-mode-chords"
      : TEXT_MODES.includes(mode)
        ? " rp-mode-text"
        : SECTION_MODES.includes(mode)
          ? " rp-mode-sections"
          : " rp-mode-lines"
    : ""
  const emphClass = mode ? EMPHASIS[mode].map((e) => ` rp-emph-${e}`).join("") : ""

  const instruction = !mode
    ? null
    : mode === "chord_move" && moveSource
      ? t.instructions.chordMoveDest(display(moveSource.chord))
      : pendingSel
        ? t.instructions.seleccionat(pendingSel.text)
        : t.instructions[mode]

  return (
    <>
      <div ref={wrapRef} className="rp-body-wrap">
        <div
          ref={rootRef}
          className={`song-body rp-body${modeClass}${emphClass}${moveSource ? " rp-moving" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current?.ghost?.remove()
            drag.current = null
            textDrag.current = null
          }}
          onPointerLeave={() => {
            if (!drag.current) setCaret(null)
          }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {selBoxes.map((b, i) => (
          <span key={i} className="rp-sel-box" style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
        ))}
        {caretBoxState && (
          <span
            className={`rp-caret${popover ? " is-fixed" : ""}`}
            style={{ left: caretBoxState.left, top: caretBoxState.top, height: caretBoxState.height }}
          />
        )}
      </div>

      {mode &&
        instruction &&
        createPortal(
          <div className="rp-instruction" role="status">
            <button type="button" className="rp-icon-btn" onClick={report.back} aria-label={t.enrere} title={t.enrere}>
              <IconChevronLeft />
            </button>
            <div className="rp-instruction-text">
              <strong>{instruction}</strong>
              {report.items.length > 0 && <small>{t.afegides(report.items.length)}</small>}
            </div>
            {pendingSel && (
              <button
                type="button"
                className="rp-btn"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  confirmSelection(pendingSel, r.left, r.bottom)
                }}
              >
                {t.continua}
              </button>
            )}
            {mode === "section_missing" && (
              <button
                type="button"
                className="rp-btn rp-btn-ghost"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setPopover({ type: "sectionMissing", x: r.left, y: r.bottom, block: lastBlock, position: "after" })
                }}
              >
                {t.alFinal}
              </button>
            )}
            <button type="button" className="rp-icon-btn" onClick={report.close} aria-label={t.cancel} title={t.cancel}>
              <IconX />
            </button>
          </div>,
          document.body,
        )}

      {popover && renderPopover(popover)}
    </>
  )

  function renderPopover(p: Popover) {
    switch (p.type) {
      case "chordReplace":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.picker.titolCanvi(display(p.chord))} onClose={closePopover}>
            <ChordPicker
              displayKey={displayKey}
              notation={notation}
              current={transposeChord(p.chord, semitones)}
              occurrences={chordCount(p.chord)}
              onPick={(chord, all) => {
                const to = toOriginal(chord)
                if (to === normalizeChord(p.chord)) return closePopover()
                add({ kind: "chord_replace", block: p.block, line: lines[p.block], chord_idx: p.ci, from: p.chord, to, scope: all ? "all" : "one" })
              }}
            />
          </ReportPopover>
        )
      case "chordAdd":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.picker.titolNou} onClose={closePopover}>
            <ChordPicker
              displayKey={displayKey}
              notation={notation}
              onPick={(chord) =>
                addChordAt(p.pos, toOriginal(chord))
              }
            />
          </ReportPopover>
        )
      case "lyricFix":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.text.comHauriaDeSer} onClose={closePopover}>
            <TextPicker
              initial={p.sel.text}
              allowEmpty
              submitLabel={t.text.afegeix}
              onSubmit={(text) => {
                if (text === p.sel.text) return closePopover()
                add({ kind: "lyric_replace", block: p.sel.block, line: lines[p.sel.block], start: p.sel.start, end: p.sel.end, from: p.sel.text, to: text })
              }}
            />
          </ReportPopover>
        )
      case "lyricMissing":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.text.queFalta} onClose={closePopover}>
            <TextPicker
              submitLabel={t.text.afegeix}
              onSubmit={(text) =>
                add({ kind: "lyric_replace", block: p.pos.block, line: lines[p.pos.block], start: p.pos.offset, end: p.pos.offset, from: "", to: text })
              }
            />
          </ReportPopover>
        )
      case "lyricLine":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.text.liniaQueFalta} onClose={closePopover}>
            <TextPicker
              submitLabel={t.text.afegeix}
              onSubmit={(text) => add({ kind: "lyric_add_line", block: p.block, line: lines[p.block], text: text.trim() })}
            />
          </ReportPopover>
        )
      case "sectionRename":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.sections.quinaEs} onClose={closePopover}>
            <SectionPicker
              current={getSectionType(p.name) ?? undefined}
              onPick={(name) => {
                if (name === p.name) return closePopover()
                add({ kind: "section_rename", block: p.block, line: lines[p.block], from: p.name, to: name })
              }}
            />
          </ReportPopover>
        )
      case "sectionAdd":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.sections.quinaEs} onClose={closePopover}>
            <SectionPicker onPick={(name) => add({ kind: "section_add", block: p.block, line: lines[p.block], name })} />
          </ReportPopover>
        )
      case "sectionMissing":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.sections.quinaEs} onClose={closePopover}>
            <SectionPicker onPick={(name) => setPopover({ ...p, type: "sectionMissingBody", name })} />
          </ReportPopover>
        )
      case "sectionMissingBody":
        return (
          <ReportPopover x={p.x} y={p.y} title={t.sections.comEs} onClose={closePopover}>
            <div className="rp-section-copy">
              {copySources(p.name).map((s) => (
                  <button
                    key={s.block}
                    type="button"
                    className="rp-chip-btn"
                    onClick={() =>
                      add({
                        kind: "section_missing",
                        block: p.block,
                        line: lines[p.block],
                        position: p.position,
                        name: p.name,
                        copy_of: { block: s.block, line: lines[s.block] },
                        text: "",
                      })
                    }
                  >
                    {t.sections.igualQue(s.name)}
                  </button>
                ))}
            </div>
            <div className="rp-label">{t.sections.lescric}</div>
            <TextPicker
              multiline
              allowEmpty
              placeholder={t.sections.textPlaceholder}
              submitLabel={t.text.afegeix}
              onSubmit={(text) =>
                add({ kind: "section_missing", block: p.block, line: lines[p.block], position: p.position, name: p.name, copy_of: null, text })
              }
            />
            <p className="rp-hint">{t.sections.noCalSaberla}</p>
          </ReportPopover>
        )
    }
  }
}
