"use client"

/**
 * src/components/editor/WysiwygEditor.tsx
 *
 * Editor WYSIWYG de cançons amb model intern bidireccional.
 *
 * Característiques:
 * - L'usuari mai veu els tags <ch>...</ch> ni <sec>...</sec>; veu acords sobre la
 *   lletra (atomics) i seccions com a blocs (atomics).
 * - El DOM es gestiona manualment (no via React). React només renderitza
 *   l'esquelet i els menús contextuals. Això evita que React reconciliï el
 *   contentEditable a cada keystroke (i en perdi el cursor).
 * - Totes les mutacions del DOM es fan via `beforeinput` interceptat. Apliquem
 *   els canvis al Doc, serialitzem, propaguem per `onChange`, i resincronitzem.
 *
 * Estratègia de sincronització:
 * - `lastSyncedRef` recorda l'últim string que el DOM ja reflecteix.
 * - Si `value` (prop) canvia i no coincideix amb `lastSyncedRef`, és un canvi
 *   extern (undo/redo, reset) → rerenderitzem el DOM des de zero.
 * - Si la mutació ve de dins, actualitzem `lastSyncedRef` ABANS de cridar
 *   `onChange` perquè el `value` que ens torni el pare ja coincideixi.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"

import { parse, serialize } from "@/lib/editor/model"
import type { Block, Doc, Inline } from "@/lib/editor/model"
import { renumberEstrofas } from "@/lib/editor/sections"

import { ChordContextMenu } from "./ChordContextMenu"
import { SectionContextMenu } from "./SectionContextMenu"

// ── Props i Handle ────────────────────────────────────────────────────────────

interface WysiwygEditorProps {
  /** Text cru (format BD amb <ch> i <sec>). Font de veritat del contingut. */
  value: string
  /** Crida quan el contingut canvia (passa el text cru serialitzat). */
  onChange: (next: string) => void
  /** Crida quan l'usuari fa pausa (commit a l'historial). */
  onCommit?: (next: string) => void
  /** Callbacks d'undo/redo (Ctrl+Z, Ctrl+Y). */
  onUndo?: () => void
  onRedo?: () => void
  /** Tonalitat actual de la cançó (per als menús contextuals d'acords). */
  chordKey: string
  /** Placeholder quan l'editor és buit. */
  placeholder?: string
  /**
   * Si està set, l'editor es renderitza com a desactivat (no editable) i mostra
   * aquest text com a missatge. S'usa, per exemple, mentre no s'ha seleccionat
   * tonalitat per a una nova cançó.
   */
  disabledReason?: string
}

export interface WysiwygEditorHandle {
  insertChordAtCursor: (chord: string) => void
  insertSectionAtCursor: (name: string) => void
  getContainer: () => HTMLElement | null
  focus: () => void
  /** Obre el menú de seccions a la posició del cursor (o al centre del contenidor). */
  openSectionMenuAtCursor: () => void
  /** Obre el menú d'acords a la posició del cursor (o al centre del contenidor). */
  openChordMenuAtCursor: () => void
}

// ── Tipus interns ─────────────────────────────────────────────────────────────

interface CursorPos {
  blockIdx: number
  /** Offset textual dins el bloc (només compta caràcters de spans `text`). */
  charOffset: number
}

interface SectionMenuState {
  open: boolean
  x: number
  y: number
  mode: "insert" | "modify"
  currentName?: string
  blockIdx?: number
}

interface ChordMenuState {
  open: boolean
  x: number
  y: number
  mode: "insert" | "modify"
  currentChord?: string
  blockIdx?: number
  spanIdx?: number
}

// ── Tipus del drag-and-drop ───────────────────────────────────────────────────

type DragTarget =
  | {
      kind: "chord"
      blockIdx: number
      /** Índex de l'span d'acord dins la llista d'spans del bloc (NO només acords). */
      spanIdxInBlock: number
      chord: string
    }
  | { kind: "section"; blockIdx: number; name: string }

type DragState =
  | { mode: "idle" }
  | {
      mode: "pending"
      button: number
      startX: number
      startY: number
      target: DragTarget
    }
  | {
      mode: "dragging"
      button: number
      target: DragTarget
      ghost: HTMLDivElement
      indicator: HTMLDivElement
      /** Posició actual del drop (per a mouseup). */
      dropPos: DropPosition | null
    }

type DropPosition =
  | { kind: "chord-pos"; blockIdx: number; charOffset: number; valid: boolean }
  | { kind: "section-between"; insertIdx: number }

// ── Helpers de DOM ────────────────────────────────────────────────────────────

/** Crea un span de text editable. */
function createTextSpan(text: string): HTMLSpanElement {
  const span = document.createElement("span")
  span.setAttribute("data-text", "")
  // Garantim que sempre hi hagi un text node intern per poder-hi posar el cursor,
  // fins i tot quan el text és buit (un text node "" hi és present però invisible).
  span.appendChild(document.createTextNode(text))
  return span
}

/** Crea un span d'acord atòmic. */
function createChordSpan(chord: string): HTMLSpanElement {
  const span = document.createElement("span")
  span.setAttribute("data-chord", chord)
  span.className = "wch"
  span.contentEditable = "false"
  // Embolcallem el text en un span intern perquè tingui dimensions reals
  // (el .wch és width:0/height:0 per a no afectar el flow de la lletra).
  // Així podem posar-hi una caixa visible quan s'està editant.
  const label = document.createElement("span")
  label.className = "wch-label"
  label.textContent = chord
  span.appendChild(label)
  return span
}

/** Crea un bloc lyric a partir d'una llista de spans. */
function createLyricBlock(spans: Inline[], blockIdx: number): HTMLDivElement {
  const div = document.createElement("div")
  div.setAttribute("data-block", "lyric")
  div.setAttribute("data-block-idx", String(blockIdx))

  if (spans.length === 0) {
    // Sense spans: posem un span de text buit perquè el cursor hi pugui anar.
    div.appendChild(createTextSpan(""))
    return div
  }

  for (const span of spans) {
    if (span.kind === "text") {
      div.appendChild(createTextSpan(span.text))
    } else {
      div.appendChild(createChordSpan(span.chord))
    }
  }

  // Si el bloc comença amb acord o acaba amb acord, hi afegim text nodes buits
  // a banda i banda perquè el cursor pugui anar abans/després.
  const firstChild = div.firstChild as HTMLElement | null
  if (firstChild && firstChild.hasAttribute("data-chord")) {
    div.insertBefore(createTextSpan(""), firstChild)
  }
  const lastChild = div.lastChild as HTMLElement | null
  if (lastChild && lastChild.hasAttribute("data-chord")) {
    div.appendChild(createTextSpan(""))
  }

  return div
}

/** Crea un bloc section atòmic. */
function createSectionBlock(name: string, blockIdx: number): HTMLDivElement {
  const div = document.createElement("div")
  div.setAttribute("data-block", "section")
  div.setAttribute("data-block-idx", String(blockIdx))
  div.setAttribute("data-section-name", name)
  div.contentEditable = "false"

  const span = document.createElement("span")
  span.className = "wsec"
  span.textContent = name
  div.appendChild(span)

  return div
}

/** Crea un bloc empty (línia visual). Inclou un span data-text buit perquè
 *  el cursor hi pugui caure i el navegador pugui aplicar text input al fill. */
function createEmptyBlock(blockIdx: number): HTMLDivElement {
  const div = document.createElement("div")
  div.setAttribute("data-block", "empty")
  div.setAttribute("data-block-idx", String(blockIdx))
  // Un span de text buit ens dóna un text node receptor del cursor.
  // El <br> que segueix garanteix l'alçada visual de la línia.
  div.appendChild(createTextSpan(""))
  div.appendChild(document.createElement("br"))
  return div
}

/** Reconstrueix tot el DOM del contenidor des d'un Doc. */
function syncDomFromDoc(container: HTMLElement, doc: Doc): void {
  // Esborrem el contingut existent
  while (container.firstChild) container.removeChild(container.firstChild)

  // Si el Doc està buit, posem un bloc lyric buit perquè el cursor hi vagi.
  if (doc.blocks.length === 0) {
    container.appendChild(createLyricBlock([], 0))
    return
  }

  doc.blocks.forEach((block, idx) => {
    if (block.kind === "lyric") {
      container.appendChild(createLyricBlock(block.spans, idx))
    } else if (block.kind === "section") {
      container.appendChild(createSectionBlock(block.name, idx))
    } else {
      container.appendChild(createEmptyBlock(idx))
    }
  })
}

/** Llegeix l'estructura del DOM i la converteix a un Doc. */
function readDomToDoc(container: HTMLElement): Doc {
  const blocks: Block[] = []

  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue
    const kind = child.getAttribute("data-block")

    if (kind === "section") {
      const name = child.getAttribute("data-section-name") ?? ""
      blocks.push({ kind: "section", name })
      continue
    }

    if (kind === "empty") {
      blocks.push({ kind: "empty" })
      continue
    }

    // lyric (o desconegut → tractem com a lyric)
    const spans: Inline[] = []
    for (const inner of Array.from(child.childNodes)) {
      if (inner instanceof HTMLElement) {
        if (inner.hasAttribute("data-chord")) {
          spans.push({
            kind: "chord",
            chord: inner.getAttribute("data-chord") ?? "",
          })
        } else if (inner.hasAttribute("data-text")) {
          spans.push({ kind: "text", text: inner.textContent ?? "" })
        } else if (inner.tagName === "BR") {
          // BR a una línia de text: ignorem (és cosmètic)
        } else {
          // Node desconegut: capturem el seu textContent com a text
          const text = inner.textContent ?? ""
          if (text) spans.push({ kind: "text", text })
        }
      } else if (inner.nodeType === Node.TEXT_NODE) {
        // Text node orfe (el navegador en pot crear) — el preservem com a text
        const text = inner.textContent ?? ""
        if (text) spans.push({ kind: "text", text })
      }
    }

    // Si no hi ha spans, és un bloc lyric buit (mantenim coherència amb empty?
    // No: si data-block="lyric", el conservem com lyric buit, no com empty).
    blocks.push({ kind: "lyric", spans: mergeAdjacentText(spans) })
  }

  return { blocks }
}

/** Fusiona spans de text adjacents perquè el Doc sigui canònic. */
function mergeAdjacentText(spans: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const span of spans) {
    const last = out[out.length - 1]
    if (
      span.kind === "text" &&
      last !== undefined &&
      last.kind === "text"
    ) {
      out[out.length - 1] = { kind: "text", text: last.text + span.text }
    } else {
      out.push(span)
    }
  }
  return out
}

// ── Helpers de cursor ─────────────────────────────────────────────────────────

/** Retorna l'element bloc ancestre d'un node, o null. */
function findBlockAncestor(
  node: Node | null,
  container: HTMLElement,
): HTMLElement | null {
  let cur: Node | null = node
  while (cur && cur !== container) {
    if (cur instanceof HTMLElement && cur.hasAttribute("data-block")) {
      return cur
    }
    cur = cur.parentNode
  }
  return null
}

/** Retorna l'índex del bloc dins el contenidor. */
function blockIndex(block: HTMLElement): number {
  const idx = block.getAttribute("data-block-idx")
  return idx === null ? -1 : parseInt(idx, 10)
}

/**
 * Calcula l'offset textual (només spans de text) dins un bloc, donat un
 * (node, offset) de selecció DOM.
 */
function computeCharOffsetInBlock(
  block: HTMLElement,
  node: Node,
  domOffset: number,
): number {
  let acc = 0

  for (const child of Array.from(block.childNodes)) {
    if (!(child instanceof HTMLElement)) {
      // Node text orfe (rar). Si és el node objectiu, sumem el seu offset.
      if (child === node) {
        return acc + Math.min(domOffset, (child.textContent ?? "").length)
      }
      acc += (child.textContent ?? "").length
      continue
    }

    if (child.hasAttribute("data-chord")) {
      // Acord: no consumeix offset textual.
      // Si la selecció està exactament damunt el span d'acord (per ex. el
      // browser hi cau): el tractem com a "abans" o "després" segons offset.
      if (child === node) {
        // Domain offset dins el span: 0 = abans, 1 = després (atomic).
        return acc
      }
      continue
    }

    if (child.hasAttribute("data-text")) {
      // Span text: el contingut és un únic text node (en general).
      const textNode = child.firstChild
      const text = child.textContent ?? ""
      if (child === node) {
        return acc + Math.min(domOffset, text.length)
      }
      if (textNode && textNode === node) {
        return acc + Math.min(domOffset, text.length)
      }
      acc += text.length
      continue
    }

    // Altre tipus: comptem el seu textContent
    if (child === node) {
      return acc + Math.min(domOffset, (child.textContent ?? "").length)
    }
    acc += (child.textContent ?? "").length
  }

  return acc
}

/**
 * Llegeix la posició actual del cursor.
 * Retorna null si no hi ha selecció dins el contenidor.
 */
function readCursorPosition(container: HTMLElement): CursorPos | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  const block = findBlockAncestor(range.startContainer, container)
  if (!block) return null

  const bIdx = blockIndex(block)
  if (bIdx < 0) return null

  const charOffset = computeCharOffsetInBlock(
    block,
    range.startContainer,
    range.startOffset,
  )

  return { blockIdx: bIdx, charOffset }
}

/**
 * Posa el cursor a una posició lògica dins el DOM. Si no troba la posició
 * exacta, posa el cursor al lloc més proper.
 */
function setCursorPosition(
  container: HTMLElement,
  pos: CursorPos,
): void {
  // Busca el bloc per data-block-idx (no per índex de fills, és el mateix
  // però volem ser robustos)
  const blocks = container.querySelectorAll("[data-block]")
  let target: HTMLElement | null = null
  for (const b of Array.from(blocks)) {
    if (
      b instanceof HTMLElement &&
      blockIndex(b) === pos.blockIdx
    ) {
      target = b
      break
    }
  }
  if (!target) {
    // Si l'índex està fora de rang, anem al final del darrer bloc
    target = container.lastElementChild as HTMLElement | null
    if (!target) return
  }

  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()

  const blockKind = target.getAttribute("data-block")

  if (blockKind === "section") {
    // Bloc atòmic: posem el cursor just abans del bloc següent.
    range.setStartAfter(target)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  if (blockKind === "empty") {
    // Bloc empty: té un span data-text buit a dins per acollir el cursor.
    const firstSpan = target.querySelector("[data-text]")
    if (firstSpan && firstSpan.firstChild) {
      range.setStart(firstSpan.firstChild, 0)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    // Fallback: cursor dins el div empty
    range.setStart(target, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  // Bloc lyric: trobem l'span de text que conté el charOffset.
  let acc = 0
  let placed = false
  for (const child of Array.from(target.childNodes)) {
    if (!(child instanceof HTMLElement)) continue
    if (child.hasAttribute("data-chord")) continue
    if (!child.hasAttribute("data-text")) continue

    const text = child.textContent ?? ""
    const len = text.length
    if (pos.charOffset <= acc + len) {
      const local = pos.charOffset - acc
      const textNode = child.firstChild
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, Math.min(local, len))
      } else {
        // No hi ha text node (span buit): el creem
        const tn = document.createTextNode("")
        child.appendChild(tn)
        range.setStart(tn, 0)
      }
      range.collapse(true)
      placed = true
      break
    }
    acc += len
  }

  if (!placed) {
    // Cursor al final del bloc
    const lastTextSpan = Array.from(target.children)
      .filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement && c.hasAttribute("data-text"),
      )
      .pop()
    if (lastTextSpan) {
      const tn = lastTextSpan.firstChild ?? document.createTextNode("")
      if (!lastTextSpan.firstChild) lastTextSpan.appendChild(tn)
      range.setStart(tn, (tn.textContent ?? "").length)
      range.collapse(true)
    } else {
      range.setStart(target, target.childNodes.length)
      range.collapse(true)
    }
  }

  sel.removeAllRanges()
  sel.addRange(range)
}

// ── Helpers de mutació del Doc ────────────────────────────────────────────────

/**
 * Retorna la longitud textual total d'un bloc lyric (suma dels seus text
 * spans). Per a section/empty retorna 0.
 */
function blockTextLength(block: Block): number {
  if (block.kind !== "lyric") return 0
  return block.spans
    .filter((s): s is { kind: "text"; text: string } => s.kind === "text")
    .reduce((acc, s) => acc + s.text.length, 0)
}

/**
 * Insereix un acord a la posició (blockIdx, charOffset) d'un Doc lyric.
 * Retorna un nou Doc.
 */
function insertChordInDoc(
  doc: Doc,
  blockIdx: number,
  charOffset: number,
  chord: string,
): Doc {
  const blocks = doc.blocks.slice()
  const block = blocks[blockIdx]
  if (!block || block.kind !== "lyric") return doc

  const newSpans: Inline[] = []
  let acc = 0
  let inserted = false
  for (const span of block.spans) {
    if (span.kind === "chord") {
      newSpans.push(span)
      continue
    }
    const len = span.text.length
    if (!inserted && charOffset <= acc + len) {
      const local = charOffset - acc
      const before = span.text.slice(0, local)
      const after = span.text.slice(local)
      if (before) newSpans.push({ kind: "text", text: before })
      newSpans.push({ kind: "chord", chord })
      if (after) newSpans.push({ kind: "text", text: after })
      inserted = true
    } else {
      newSpans.push(span)
    }
    acc += len
  }
  if (!inserted) newSpans.push({ kind: "chord", chord })

  blocks[blockIdx] = { kind: "lyric", spans: newSpans }
  return { blocks }
}

/** Insereix text pla en una posició lyric. */
function insertTextInDoc(
  doc: Doc,
  blockIdx: number,
  charOffset: number,
  text: string,
): Doc {
  if (text === "") return doc
  const blocks = doc.blocks.slice()
  const block = blocks[blockIdx]
  if (!block) return doc

  if (block.kind === "empty") {
    // L'empty es converteix en lyric amb el text
    blocks[blockIdx] = { kind: "lyric", spans: [{ kind: "text", text }] }
    return { blocks }
  }

  if (block.kind === "section") {
    // No es pot inserir text dins una secció (atomic)
    return doc
  }

  // lyric
  const newSpans: Inline[] = []
  let acc = 0
  let inserted = false
  for (const span of block.spans) {
    if (span.kind === "chord") {
      newSpans.push(span)
      continue
    }
    const len = span.text.length
    if (!inserted && charOffset <= acc + len) {
      const local = charOffset - acc
      const before = span.text.slice(0, local)
      const after = span.text.slice(local)
      newSpans.push({ kind: "text", text: before + text + after })
      inserted = true
    } else {
      newSpans.push(span)
    }
    acc += len
  }
  if (!inserted) {
    // Cursor al final: afegim el text al final
    const last = newSpans[newSpans.length - 1]
    if (last && last.kind === "text") {
      newSpans[newSpans.length - 1] = {
        kind: "text",
        text: last.text + text,
      }
    } else {
      newSpans.push({ kind: "text", text })
    }
  }

  blocks[blockIdx] = {
    kind: "lyric",
    spans: mergeAdjacentText(newSpans),
  }
  return { blocks }
}

/**
 * Divideix un bloc lyric en dos a la posició textual donada.
 * Retorna els dos nous blocs.
 */
function splitLyricBlock(
  block: Extract<Block, { kind: "lyric" }>,
  charOffset: number,
): [Block, Block] {
  const left: Inline[] = []
  const right: Inline[] = []
  let acc = 0
  let crossed = false

  for (const span of block.spans) {
    if (span.kind === "chord") {
      if (crossed) right.push(span)
      else left.push(span)
      continue
    }
    const len = span.text.length
    if (!crossed && charOffset <= acc + len) {
      const local = charOffset - acc
      const before = span.text.slice(0, local)
      const after = span.text.slice(local)
      if (before) left.push({ kind: "text", text: before })
      if (after) right.push({ kind: "text", text: after })
      crossed = true
    } else if (!crossed) {
      left.push(span)
    } else {
      right.push(span)
    }
    acc += len
  }

  return [
    { kind: "lyric", spans: left },
    { kind: "lyric", spans: right },
  ]
}

/**
 * Insereix un salt de línia (Enter) a la posició actual.
 * - Si és lyric: divideix el bloc.
 * - Si és section: crea una nova línia lyric buida després.
 * - Si és empty: insereix un altre empty després.
 */
function insertParagraphInDoc(
  doc: Doc,
  blockIdx: number,
  charOffset: number,
): { doc: Doc; newPos: CursorPos } {
  const blocks = doc.blocks.slice()
  const block = blocks[blockIdx]
  if (!block) return { doc, newPos: { blockIdx, charOffset } }

  if (block.kind === "lyric") {
    const [left, right] = splitLyricBlock(block, charOffset)
    blocks.splice(blockIdx, 1, left, right)
    return {
      doc: { blocks },
      newPos: { blockIdx: blockIdx + 1, charOffset: 0 },
    }
  }

  if (block.kind === "section") {
    // Insereix un lyric buit just després
    blocks.splice(blockIdx + 1, 0, { kind: "lyric", spans: [] })
    return {
      doc: { blocks },
      newPos: { blockIdx: blockIdx + 1, charOffset: 0 },
    }
  }

  // empty
  blocks.splice(blockIdx + 1, 0, { kind: "empty" })
  return {
    doc: { blocks },
    newPos: { blockIdx: blockIdx + 1, charOffset: 0 },
  }
}

/**
 * Esborra el caràcter previ al cursor (Backspace).
 * Si el cursor està al principi del bloc, fusiona amb el bloc anterior.
 */
function deleteBackwardInDoc(
  doc: Doc,
  blockIdx: number,
  charOffset: number,
): { doc: Doc; newPos: CursorPos } {
  const blocks = doc.blocks.slice()
  const block = blocks[blockIdx]
  if (!block) return { doc, newPos: { blockIdx, charOffset } }

  // Cas 1: principi de bloc.
  // Primer comprovem si el bloc actual és lyric i el primer span és un acord:
  // en aquest cas, Backspace ha d'esborrar l'acord (no fusionar amb el bloc previ).
  if (charOffset === 0 && block.kind === "lyric") {
    // Trobar l'ÚLTIM acord consecutiu al principi del bloc (n'hi pot haver
    // diversos seguits si l'usuari ha estat borrant text entre ells).
    let firstNonChordIdx = -1
    for (let i = 0; i < block.spans.length; i++) {
      const s = block.spans[i]
      if (s && s.kind === "chord") continue
      firstNonChordIdx = i
      break
    }
    // Si tot són acords o n'hi ha algun al davant del text:
    if (firstNonChordIdx > 0 || (firstNonChordIdx === -1 && block.spans.length > 0)) {
      // Esborrem el darrer acord d'aquesta seqüència inicial (el més proper al cursor).
      const lastChordIdx = (firstNonChordIdx === -1 ? block.spans.length : firstNonChordIdx) - 1
      const newSpans = block.spans.slice()
      newSpans.splice(lastChordIdx, 1)
      blocks[blockIdx] = {
        kind: "lyric",
        spans: mergeAdjacentText(newSpans),
      }
      return {
        doc: { blocks },
        newPos: { blockIdx, charOffset: 0 },
      }
    }
  }

  // Cas 1b: principi de bloc (sense acords al davant) → fusiona amb bloc anterior
  if (charOffset === 0) {
    if (blockIdx === 0) {
      // Ja som al principi de tot; res a fer
      return { doc, newPos: { blockIdx, charOffset } }
    }
    const prev = blocks[blockIdx - 1]
    if (!prev) return { doc, newPos: { blockIdx, charOffset } }

    if (prev.kind === "section" || prev.kind === "empty") {
      // Esborrem el bloc anterior sencer
      blocks.splice(blockIdx - 1, 1)
      return {
        doc: { blocks },
        newPos: { blockIdx: blockIdx - 1, charOffset: 0 },
      }
    }

    if (prev.kind === "lyric" && block.kind === "lyric") {
      // Fusionem els dos lyric
      const prevLen = blockTextLength(prev)
      const merged: Block = {
        kind: "lyric",
        spans: mergeAdjacentText([...prev.spans, ...block.spans]),
      }
      blocks.splice(blockIdx - 1, 2, merged)
      return {
        doc: { blocks },
        newPos: { blockIdx: blockIdx - 1, charOffset: prevLen },
      }
    }

    // prev lyric, current section/empty: posem el cursor al final del previ
    if (prev.kind === "lyric") {
      const prevLen = blockTextLength(prev)
      blocks.splice(blockIdx, 1)
      return {
        doc: { blocks },
        newPos: { blockIdx: blockIdx - 1, charOffset: prevLen },
      }
    }

    return { doc, newPos: { blockIdx, charOffset } }
  }

  // Cas 2: cursor dins un bloc lyric → esborrar 1 caràcter o acord previ
  if (block.kind !== "lyric") {
    return { doc, newPos: { blockIdx, charOffset } }
  }

  // Recorrem els spans i trobem què hi ha just abans del charOffset.
  const newSpans: Inline[] = []
  let acc = 0
  let removed = false
  let newCharOffset = charOffset

  for (let i = 0; i < block.spans.length; i++) {
    const span = block.spans[i]
    if (!span) continue

    if (span.kind === "chord") {
      // L'acord està entre text. Si el cursor està just a la posició acc, vol
      // dir que estem just darrere d'aquest acord (l'acord no consumeix
      // offset). Si charOffset === acc i encara no s'ha esborrat res →
      // esborra l'acord.
      if (!removed && charOffset === acc) {
        // Esborrem l'acord (no afegim al nou array)
        removed = true
      } else {
        newSpans.push(span)
      }
      continue
    }

    const len = span.text.length
    if (!removed && charOffset > acc && charOffset <= acc + len) {
      // El cursor és dins d'aquest span de text
      const local = charOffset - acc
      const newText = span.text.slice(0, local - 1) + span.text.slice(local)
      if (newText) newSpans.push({ kind: "text", text: newText })
      newCharOffset = charOffset - 1
      removed = true
    } else {
      newSpans.push(span)
    }
    acc += len
  }

  if (!removed) {
    // Res a esborrar
    return { doc, newPos: { blockIdx, charOffset } }
  }

  blocks[blockIdx] = {
    kind: "lyric",
    spans: mergeAdjacentText(newSpans),
  }
  return {
    doc: { blocks },
    newPos: { blockIdx, charOffset: newCharOffset },
  }
}

/**
 * Esborra el caràcter següent al cursor (Delete).
 */
function deleteForwardInDoc(
  doc: Doc,
  blockIdx: number,
  charOffset: number,
): { doc: Doc; newPos: CursorPos } {
  const blocks = doc.blocks.slice()
  const block = blocks[blockIdx]
  if (!block) return { doc, newPos: { blockIdx, charOffset } }

  // Si el cursor és al final del bloc → fusiona amb el següent
  const isAtEnd =
    block.kind !== "lyric" || charOffset >= blockTextLength(block)

  if (isAtEnd) {
    if (blockIdx >= blocks.length - 1) {
      return { doc, newPos: { blockIdx, charOffset } }
    }
    const next = blocks[blockIdx + 1]
    if (!next) return { doc, newPos: { blockIdx, charOffset } }

    if (next.kind === "section" || next.kind === "empty") {
      blocks.splice(blockIdx + 1, 1)
      return { doc: { blocks }, newPos: { blockIdx, charOffset } }
    }

    if (next.kind === "lyric" && block.kind === "lyric") {
      const merged: Block = {
        kind: "lyric",
        spans: mergeAdjacentText([...block.spans, ...next.spans]),
      }
      blocks.splice(blockIdx, 2, merged)
      return {
        doc: { blocks },
        newPos: { blockIdx, charOffset },
      }
    }

    if (next.kind === "lyric" && block.kind !== "lyric") {
      // El bloc actual és section/empty. Esborra el bloc actual i col·loca
      // el cursor al principi del lyric.
      blocks.splice(blockIdx, 1)
      return {
        doc: { blocks },
        newPos: { blockIdx, charOffset: 0 },
      }
    }

    return { doc, newPos: { blockIdx, charOffset } }
  }

  // Cursor dins lyric: esborra 1 char/acord cap endavant
  if (block.kind !== "lyric") {
    return { doc, newPos: { blockIdx, charOffset } }
  }

  const newSpans: Inline[] = []
  let acc = 0
  let removed = false

  for (let i = 0; i < block.spans.length; i++) {
    const span = block.spans[i]
    if (!span) continue

    if (span.kind === "chord") {
      // Si el cursor és just a acc i no hem esborrat encara, esborra l'acord.
      if (!removed && charOffset === acc) {
        removed = true
      } else {
        newSpans.push(span)
      }
      continue
    }

    const len = span.text.length
    if (!removed && charOffset >= acc && charOffset < acc + len) {
      const local = charOffset - acc
      const newText = span.text.slice(0, local) + span.text.slice(local + 1)
      if (newText) newSpans.push({ kind: "text", text: newText })
      removed = true
    } else {
      newSpans.push(span)
    }
    acc += len
  }

  if (!removed) return { doc, newPos: { blockIdx, charOffset } }

  blocks[blockIdx] = {
    kind: "lyric",
    spans: mergeAdjacentText(newSpans),
  }
  return { doc: { blocks }, newPos: { blockIdx, charOffset } }
}

/**
 * Esborra el contingut entre dues posicions (selecció no buida).
 * Suporta esborrar a través de múltiples blocs.
 */
function deleteRangeInDoc(
  doc: Doc,
  start: CursorPos,
  end: CursorPos,
): { doc: Doc; newPos: CursorPos } {
  // Normalitzem ordre
  const [a, b] = comparePos(start, end) <= 0 ? [start, end] : [end, start]

  const blocks = doc.blocks.slice()

  if (a.blockIdx === b.blockIdx) {
    const block = blocks[a.blockIdx]
    if (!block) return { doc, newPos: a }
    if (block.kind === "lyric") {
      const newSpans = sliceLyricSpans(block.spans, 0, a.charOffset).concat(
        sliceLyricSpans(block.spans, b.charOffset, blockTextLength(block)),
      )
      blocks[a.blockIdx] = {
        kind: "lyric",
        spans: mergeAdjacentText(newSpans),
      }
      return { doc: { blocks }, newPos: a }
    }
    // Per a section/empty: si la selecció els cobreix, els esborrem.
    blocks.splice(a.blockIdx, 1)
    return {
      doc: { blocks },
      newPos: { blockIdx: a.blockIdx, charOffset: 0 },
    }
  }

  // Selecció multi-bloc
  const startBlock = blocks[a.blockIdx]
  const endBlock = blocks[b.blockIdx]
  if (!startBlock || !endBlock) return { doc, newPos: a }

  let mergedBlock: Block

  if (startBlock.kind === "lyric" && endBlock.kind === "lyric") {
    const leftSpans = sliceLyricSpans(startBlock.spans, 0, a.charOffset)
    const rightSpans = sliceLyricSpans(
      endBlock.spans,
      b.charOffset,
      blockTextLength(endBlock),
    )
    mergedBlock = {
      kind: "lyric",
      spans: mergeAdjacentText([...leftSpans, ...rightSpans]),
    }
  } else if (startBlock.kind === "lyric") {
    mergedBlock = {
      kind: "lyric",
      spans: sliceLyricSpans(startBlock.spans, 0, a.charOffset),
    }
  } else if (endBlock.kind === "lyric") {
    mergedBlock = {
      kind: "lyric",
      spans: sliceLyricSpans(
        endBlock.spans,
        b.charOffset,
        blockTextLength(endBlock),
      ),
    }
  } else {
    mergedBlock = { kind: "empty" }
  }

  const removeCount = b.blockIdx - a.blockIdx + 1
  blocks.splice(a.blockIdx, removeCount, mergedBlock)

  return { doc: { blocks }, newPos: a }
}

/** Compara dues posicions. */
function comparePos(a: CursorPos, b: CursorPos): number {
  if (a.blockIdx !== b.blockIdx) return a.blockIdx - b.blockIdx
  return a.charOffset - b.charOffset
}

/** Retorna els spans d'un bloc lyric retallats entre dues offsets textuals. */
function sliceLyricSpans(
  spans: Inline[],
  from: number,
  to: number,
): Inline[] {
  if (from >= to) return []
  const out: Inline[] = []
  let acc = 0
  for (const span of spans) {
    if (span.kind === "chord") {
      // L'acord està entre text. L'incloem si la seva posició textual cau
      // estrictament dins [from, to). (En from = acc → acord just al límit
      // esquerre el descartem; en to = acc → ja hem sobrepassat).
      if (acc > from && acc <= to) {
        out.push(span)
      } else if (acc === from && from > 0) {
        // Cas frontera: l'acord just al principi del rang.
        // L'incloem si no és la posició estricta del cursor inicial buit.
        out.push(span)
      }
      continue
    }
    const len = span.text.length
    const segFrom = Math.max(0, from - acc)
    const segTo = Math.min(len, to - acc)
    if (segFrom < segTo) {
      out.push({ kind: "text", text: span.text.slice(segFrom, segTo) })
    }
    acc += len
  }
  return out
}

/**
 * Extreu el sub-Doc corresponent a una selecció (per copy/cut).
 */
function extractRangeDoc(
  doc: Doc,
  start: CursorPos,
  end: CursorPos,
): Doc {
  const [a, b] = comparePos(start, end) <= 0 ? [start, end] : [end, start]

  if (a.blockIdx === b.blockIdx) {
    const block = doc.blocks[a.blockIdx]
    if (!block) return { blocks: [] }
    if (block.kind === "lyric") {
      return {
        blocks: [
          {
            kind: "lyric",
            spans: mergeAdjacentText(
              sliceLyricSpans(block.spans, a.charOffset, b.charOffset),
            ),
          },
        ],
      }
    }
    return { blocks: [block] }
  }

  const out: Block[] = []
  const startBlock = doc.blocks[a.blockIdx]
  const endBlock = doc.blocks[b.blockIdx]

  if (startBlock) {
    if (startBlock.kind === "lyric") {
      out.push({
        kind: "lyric",
        spans: mergeAdjacentText(
          sliceLyricSpans(
            startBlock.spans,
            a.charOffset,
            blockTextLength(startBlock),
          ),
        ),
      })
    } else {
      out.push(startBlock)
    }
  }

  for (let i = a.blockIdx + 1; i < b.blockIdx; i++) {
    const blk = doc.blocks[i]
    if (blk) out.push(blk)
  }

  if (endBlock) {
    if (endBlock.kind === "lyric") {
      out.push({
        kind: "lyric",
        spans: mergeAdjacentText(
          sliceLyricSpans(endBlock.spans, 0, b.charOffset),
        ),
      })
    } else {
      out.push(endBlock)
    }
  }

  return { blocks: out }
}

/** Insereix un Doc dins un altre a la posició donada. */
function insertDocAtPos(
  doc: Doc,
  pos: CursorPos,
  insert: Doc,
): { doc: Doc; newPos: CursorPos } {
  if (insert.blocks.length === 0) return { doc, newPos: pos }

  const blocks = doc.blocks.slice()
  const block = blocks[pos.blockIdx]

  // Cas senzill: un sol bloc lyric → insereix els spans
  if (insert.blocks.length === 1) {
    const inserted = insert.blocks[0]
    if (!inserted) return { doc, newPos: pos }
    if (inserted.kind === "lyric") {
      if (block && block.kind === "lyric") {
        const left = sliceLyricSpans(block.spans, 0, pos.charOffset)
        const right = sliceLyricSpans(
          block.spans,
          pos.charOffset,
          blockTextLength(block),
        )
        const newBlock: Block = {
          kind: "lyric",
          spans: mergeAdjacentText([...left, ...inserted.spans, ...right]),
        }
        blocks[pos.blockIdx] = newBlock
        const newCharOffset =
          pos.charOffset + blockTextLength(inserted)
        return {
          doc: { blocks },
          newPos: { blockIdx: pos.blockIdx, charOffset: newCharOffset },
        }
      }
    }
  }

  // Cas multi-bloc o secció/empty: dividim el bloc actual i intercalem.
  let leftBlock: Block | null = null
  let rightBlock: Block | null = null

  if (block && block.kind === "lyric") {
    const [l, r] = splitLyricBlock(block, pos.charOffset)
    leftBlock = l
    rightBlock = r
  }

  const newBlocks = [...insert.blocks]
  let newBlockIdx = pos.blockIdx
  let newCharOffset = 0

  // Calculem la nova posició: després del darrer bloc inserit
  const lastInserted = newBlocks[newBlocks.length - 1]
  if (lastInserted && lastInserted.kind === "lyric") {
    newCharOffset = blockTextLength(lastInserted)
  }

  if (leftBlock !== null && rightBlock !== null) {
    blocks.splice(pos.blockIdx, 1, leftBlock, ...newBlocks, rightBlock)
    newBlockIdx = pos.blockIdx + newBlocks.length
    // Si el darrer inserit i el rightBlock són lyric, els fusionem
    if (
      lastInserted &&
      lastInserted.kind === "lyric" &&
      rightBlock.kind === "lyric"
    ) {
      const idx = pos.blockIdx + newBlocks.length // posició del rightBlock
      const merged: Block = {
        kind: "lyric",
        spans: mergeAdjacentText([
          ...lastInserted.spans,
          ...rightBlock.spans,
        ]),
      }
      blocks.splice(idx - 1, 2, merged)
      newBlockIdx = idx - 1
    }
  } else {
    blocks.splice(pos.blockIdx, block ? 1 : 0, ...newBlocks)
    newBlockIdx = pos.blockIdx + newBlocks.length - 1
  }

  return { doc: { blocks }, newPos: { blockIdx: newBlockIdx, charOffset: newCharOffset } }
}

// ── Renumeració d'estrofes ────────────────────────────────────────────────────

function renumberDocEstrofas(doc: Doc): Doc {
  const sectionNames: string[] = []
  for (const b of doc.blocks) {
    if (b.kind === "section") sectionNames.push(b.name)
  }
  const renamed = renumberEstrofas(sectionNames)
  if (renamed.every((n, i) => n === sectionNames[i])) return doc

  const blocks: Block[] = []
  let i = 0
  for (const b of doc.blocks) {
    if (b.kind === "section") {
      const newName = renamed[i] ?? b.name
      blocks.push({ kind: "section", name: newName })
      i++
    } else {
      blocks.push(b)
    }
  }
  return { blocks }
}

// ── Helpers de moviment per drag-and-drop ─────────────────────────────────────

/**
 * Mou un acord d'una posició origen a una nova posició textual dins un bloc
 * lyric. Si el bloc destí no és lyric, retorna el Doc original.
 *
 * - `from.spanIdxInBlock` és l'índex de l'span (entre TOTS els spans del bloc).
 * - `to.charOffset` és l'offset textual dins el bloc lyric destí.
 */
function moveChordInDoc(
  doc: Doc,
  from: { blockIdx: number; spanIdxInBlock: number },
  to: { blockIdx: number; charOffset: number },
): Doc {
  const srcBlock = doc.blocks[from.blockIdx]
  if (!srcBlock || srcBlock.kind !== "lyric") return doc
  const srcSpan = srcBlock.spans[from.spanIdxInBlock]
  if (!srcSpan || srcSpan.kind !== "chord") return doc

  // El destí ha de ser lyric o empty (l'empty es converteix a lyric)
  const dstBlock = doc.blocks[to.blockIdx]
  if (!dstBlock || dstBlock.kind === "section") return doc

  const chord = srcSpan.chord

  // 1) Treu l'acord del bloc origen
  const blocks = doc.blocks.slice()
  const newSrcSpans = srcBlock.spans.slice()
  newSrcSpans.splice(from.spanIdxInBlock, 1)
  blocks[from.blockIdx] = {
    kind: "lyric",
    spans: mergeAdjacentText(newSrcSpans),
  }

  // 2) Si el destí és el mateix bloc, l'hem actualitzat ja: cal recalcular
  //    el charOffset si l'acord eliminat l'afectava — però com que els acords
  //    no consumeixen offset textual, no cal cap ajust.
  // 3) Insereix l'acord al destí.
  let next: Doc = { blocks }
  const dstAfterRemoval = next.blocks[to.blockIdx]
  if (!dstAfterRemoval) return doc

  if (dstAfterRemoval.kind === "empty") {
    const updated = next.blocks.slice()
    updated[to.blockIdx] = { kind: "lyric", spans: [{ kind: "chord", chord }] }
    next = { blocks: updated }
    return next
  }

  return insertChordInDoc(next, to.blockIdx, to.charOffset, chord)
}

/**
 * Mou una secció de `fromIdx` a `toIdx`, on `toIdx` és el "punt de drop"
 * (la posició entre dos blocs abans de l'ajust per a l'origen).
 *
 * Convenció: `toIdx` representa la posició al `splice` (0 = abans del bloc 0,
 * blocks.length = al final).
 */
function moveSectionInDoc(doc: Doc, fromIdx: number, toIdx: number): Doc {
  const block = doc.blocks[fromIdx]
  if (!block || block.kind !== "section") return doc

  const blocks = doc.blocks.slice()
  const [removed] = blocks.splice(fromIdx, 1)
  if (!removed) return doc

  // Si fromIdx < toIdx, després de l'splice tots els índexs posteriors baixen 1.
  const adjustedToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx
  const clamped = Math.max(0, Math.min(adjustedToIdx, blocks.length))
  blocks.splice(clamped, 0, removed)
  return { blocks }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const WysiwygEditor = forwardRef<
  WysiwygEditorHandle,
  WysiwygEditorProps
>(function WysiwygEditor(
  { value, onChange, onCommit, onUndo, onRedo, chordKey, placeholder, disabledReason },
  ref,
): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSyncedRef = useRef<string>(value)
  /**
   * Doc actual reflectit al DOM. Es manté en un ref (no state) per evitar
   * re-renders i poder llegir-lo des de handlers d'esdeveniments sense
   * dependències estancades.
   */
  const docRef = useRef<Doc>(parse(value))

  const [isEmpty, setIsEmpty] = useState<boolean>(value === "")

  const [sectionMenu, setSectionMenu] = useState<SectionMenuState>({
    open: false,
    x: 0,
    y: 0,
    mode: "insert",
  })
  const [chordMenu, setChordMenu] = useState<ChordMenuState>({
    open: false,
    x: 0,
    y: 0,
    mode: "insert",
  })

  /**
   * Estat del drag-and-drop. És un useRef (no useState) perquè:
   * - Evitem re-renders durant el moviment.
   * - Llegim/escrivim des de listeners globals adjuntats a window sense
   *   dependències estancades.
   * Els elements visuals (ghost, drop indicator) es manipulen via DOM directe.
   */
  const dragStateRef = useRef<DragState>({ mode: "idle" })

  // ── Sincronització DOM ↔ Doc ───────────────────────────────────────────────

  /**
   * Aplica un nou Doc: re-renderitza el DOM, serialitza, propaga via onChange
   * i opcionalment via onCommit. Restaura el cursor a la posició indicada.
   */
  const commitDoc = useCallback(
    (nextDoc: Doc, newPos: CursorPos | null, isCommitPoint: boolean): void => {
      const container = containerRef.current
      if (!container) return

      // Renumera estrofes si hi ha hagut canvis a seccions.
      const finalDoc = renumberDocEstrofas(nextDoc)

      docRef.current = finalDoc
      const next = serialize(finalDoc)

      syncDomFromDoc(container, finalDoc)
      setIsEmpty(next === "")

      if (newPos) {
        // Clamp la posició a un rang vàlid
        const safe = clampPos(newPos, finalDoc)
        setCursorPosition(container, safe)
      }

      if (next !== lastSyncedRef.current) {
        lastSyncedRef.current = next
        onChange(next)
        if (isCommitPoint && onCommit) onCommit(next)
      }
    },
    [onChange, onCommit],
  )

  // Sync extern: si value canvia per pare i no l'hem causat nosaltres, redibuixa.
  useLayoutEffect(() => {
    if (value === lastSyncedRef.current) return
    const container = containerRef.current
    if (!container) return

    const doc = parse(value)
    docRef.current = doc
    syncDomFromDoc(container, doc)
    setIsEmpty(value === "")
    lastSyncedRef.current = value
  }, [value])

  // Render inicial del DOM
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (container.children.length === 0) {
      syncDomFromDoc(container, docRef.current)
    }
  }, [])

  // ── Existing section names (per al menú) ───────────────────────────────────

  const existingSectionNames = useMemo<string[]>(() => {
    // Recalcula cada vegada que value canvia (deps explícita).
    const d = parse(value)
    return d.blocks
      .filter((b): b is { kind: "section"; name: string } => b.kind === "section")
      .map((b) => b.name)
  }, [value])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleBeforeInput = useCallback(
    (e: InputEvent) => {
      // Listener natiu (no React sintètic): React no dispara onBeforeInput
      // de forma fiable a contentEditable en alguns navegadors (Firefox).
      const inputType = e.inputType
      const container = containerRef.current
      if (!container) return

      const sel = window.getSelection()
      if (!sel) return

      // Calculem la selecció lògica. Si el navegador no ens dóna una posició
      // vàlida (cursor fora dels blocs), fem fallback al final del darrer bloc
      // per no deixar l'event passar i corrompre el DOM.
      let startPos = readCursorPosition(container)
      if (!startPos) {
        e.preventDefault()
        const doc = docRef.current
        const lastIdx = Math.max(0, doc.blocks.length - 1)
        const lastBlock = doc.blocks[lastIdx]
        const lastOffset =
          lastBlock && lastBlock.kind === "lyric"
            ? lastBlock.spans.reduce(
                (a, s) => (s.kind === "text" ? a + s.text.length : a),
                0,
              )
            : 0
        startPos = { blockIdx: lastIdx, charOffset: lastOffset }
      }

      // Detectem si hi ha selecció no buida
      let endPos: CursorPos = startPos
      let hasSelection = false
      if (sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        const endBlock = findBlockAncestor(range.endContainer, container)
        if (endBlock) {
          const endBlockIdx = blockIndex(endBlock)
          if (endBlockIdx >= 0) {
            const endChar = computeCharOffsetInBlock(
              endBlock,
              range.endContainer,
              range.endOffset,
            )
            endPos = { blockIdx: endBlockIdx, charOffset: endChar }
            hasSelection = comparePos(startPos, endPos) !== 0
          }
        }
      }

      const doc = docRef.current

      switch (inputType) {
        case "insertText":
        case "insertCompositionText":
        case "insertReplacementText": {
          e.preventDefault()
          const text = e.data ?? ""
          if (text === "") return
          let workDoc = doc
          let pos = startPos
          if (hasSelection) {
            const r = deleteRangeInDoc(workDoc, startPos, endPos)
            workDoc = r.doc
            pos = r.newPos
          }
          const out = insertTextInDoc(workDoc, pos.blockIdx, pos.charOffset, text)
          commitDoc(
            out,
            { blockIdx: pos.blockIdx, charOffset: pos.charOffset + text.length },
            false,
          )
          return
        }

        case "insertParagraph":
        case "insertLineBreak": {
          e.preventDefault()
          let workDoc = doc
          let pos = startPos
          if (hasSelection) {
            const r = deleteRangeInDoc(workDoc, startPos, endPos)
            workDoc = r.doc
            pos = r.newPos
          }
          const out = insertParagraphInDoc(workDoc, pos.blockIdx, pos.charOffset)
          commitDoc(out.doc, out.newPos, true)
          return
        }

        case "deleteContentBackward":
        case "deleteWordBackward":
        case "deleteSoftLineBackward":
        case "deleteHardLineBackward": {
          e.preventDefault()
          if (hasSelection) {
            const r = deleteRangeInDoc(doc, startPos, endPos)
            commitDoc(r.doc, r.newPos, true)
            return
          }
          const r = deleteBackwardInDoc(doc, startPos.blockIdx, startPos.charOffset)
          commitDoc(r.doc, r.newPos, true)
          return
        }

        case "deleteContentForward":
        case "deleteWordForward":
        case "deleteSoftLineForward":
        case "deleteHardLineForward": {
          e.preventDefault()
          if (hasSelection) {
            const r = deleteRangeInDoc(doc, startPos, endPos)
            commitDoc(r.doc, r.newPos, true)
            return
          }
          const r = deleteForwardInDoc(doc, startPos.blockIdx, startPos.charOffset)
          commitDoc(r.doc, r.newPos, true)
          return
        }

        case "deleteByCut": {
          // El handler de cut ja s'encarrega del portapapers.
          e.preventDefault()
          if (hasSelection) {
            const r = deleteRangeInDoc(doc, startPos, endPos)
            commitDoc(r.doc, r.newPos, true)
          }
          return
        }

        case "insertFromPaste":
        case "insertFromPasteAsQuotation":
        case "insertFromDrop": {
          // El handler de paste ja s'encarrega; aquí prevenim el natiu.
          e.preventDefault()
          return
        }

        default: {
          // Per tot el que no controlem, prevenim el comportament natiu per
          // no desincronitzar el DOM amb el model.
          e.preventDefault()
          return
        }
      }
    },
    [commitDoc],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (onUndo) onUndo()
        return
      }
      if (
        (ctrl && e.key.toLowerCase() === "y") ||
        (ctrl && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault()
        if (onRedo) onRedo()
        return
      }

      if (e.key === "Tab") {
        e.preventDefault()
        const container = containerRef.current
        if (!container) return
        const pos = readCursorPosition(container)
        if (!pos) return
        const out = insertTextInDoc(docRef.current, pos.blockIdx, pos.charOffset, "  ")
        commitDoc(
          out,
          { blockIdx: pos.blockIdx, charOffset: pos.charOffset + 2 },
          false,
        )
      }
    },
    [onUndo, onRedo, commitDoc],
  )

  // ── Copy / Cut / Paste ─────────────────────────────────────────────────────

  const getSelectionPositions = useCallback((): {
    start: CursorPos
    end: CursorPos
  } | null => {
    const container = containerRef.current
    if (!container) return null
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const startBlock = findBlockAncestor(range.startContainer, container)
    const endBlock = findBlockAncestor(range.endContainer, container)
    if (!startBlock || !endBlock) return null
    const startBlockIdx = blockIndex(startBlock)
    const endBlockIdx = blockIndex(endBlock)
    if (startBlockIdx < 0 || endBlockIdx < 0) return null
    const start: CursorPos = {
      blockIdx: startBlockIdx,
      charOffset: computeCharOffsetInBlock(
        startBlock,
        range.startContainer,
        range.startOffset,
      ),
    }
    const end: CursorPos = {
      blockIdx: endBlockIdx,
      charOffset: computeCharOffsetInBlock(
        endBlock,
        range.endContainer,
        range.endOffset,
      ),
    }
    return { start, end }
  }, [])

  const handleCopy = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const sel = getSelectionPositions()
      if (!sel) return
      if (comparePos(sel.start, sel.end) === 0) return
      const subDoc = extractRangeDoc(docRef.current, sel.start, sel.end)
      const text = serialize(subDoc)
      e.preventDefault()
      e.clipboardData.setData("text/plain", text)
    },
    [getSelectionPositions],
  )

  const handleCut = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const sel = getSelectionPositions()
      if (!sel) return
      if (comparePos(sel.start, sel.end) === 0) return
      const subDoc = extractRangeDoc(docRef.current, sel.start, sel.end)
      const text = serialize(subDoc)
      e.preventDefault()
      e.clipboardData.setData("text/plain", text)

      // Esborra la selecció del doc
      const r = deleteRangeInDoc(docRef.current, sel.start, sel.end)
      commitDoc(r.doc, r.newPos, true)
    },
    [getSelectionPositions, commitDoc],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      const text = e.clipboardData.getData("text/plain")
      if (text === "") return

      const container = containerRef.current
      if (!container) return
      const sel = getSelectionPositions()
      if (!sel) return

      // Si hi ha selecció, l'esborrem primer
      let workDoc = docRef.current
      let pos = sel.start
      if (comparePos(sel.start, sel.end) !== 0) {
        const r = deleteRangeInDoc(workDoc, sel.start, sel.end)
        workDoc = r.doc
        pos = r.newPos
      }

      // Determinem si el contingut té tags (parse-able) o és text pla.
      const hasTags = /<ch>|<sec>/.test(text) || text.includes("\n")
      if (hasTags) {
        const insertDoc = parse(text)
        const r = insertDocAtPos(workDoc, pos, insertDoc)
        commitDoc(r.doc, r.newPos, true)
      } else {
        const r = insertTextInDoc(workDoc, pos.blockIdx, pos.charOffset, text)
        commitDoc(
          r,
          { blockIdx: pos.blockIdx, charOffset: pos.charOffset + text.length },
          true,
        )
      }
    },
    [getSelectionPositions, commitDoc],
  )

  // ── Menús contextuals ──────────────────────────────────────────────────────

  /**
   * Determina sobre quin element (chord, section, lyric) està el target.
   */
  const inspectTarget = useCallback(
    (
      target: EventTarget | null,
    ): {
      kind: "chord" | "section" | "lyric" | "none"
      blockIdx: number
      spanIdx?: number
      chord?: string
      sectionName?: string
    } => {
      const container = containerRef.current
      if (!container || !(target instanceof Node)) {
        return { kind: "none", blockIdx: -1 }
      }
      const block = findBlockAncestor(target, container)
      if (!block) return { kind: "none", blockIdx: -1 }
      const bIdx = blockIndex(block)
      const kind = block.getAttribute("data-block")

      // Mira si el target és (o està dins) un span d'acord
      let cur: Node | null = target
      while (cur && cur !== block) {
        if (
          cur instanceof HTMLElement &&
          cur.hasAttribute("data-chord")
        ) {
          // Trobar l'spanIdx dins el bloc (només acords)
          const chords = Array.from(block.children).filter(
            (c) => c instanceof HTMLElement && c.hasAttribute("data-chord"),
          )
          const spanIdx = chords.indexOf(cur as HTMLElement)
          return {
            kind: "chord",
            blockIdx: bIdx,
            spanIdx,
            chord: cur.getAttribute("data-chord") ?? "",
          }
        }
        cur = cur.parentNode
      }

      if (kind === "section") {
        return {
          kind: "section",
          blockIdx: bIdx,
          sectionName: block.getAttribute("data-section-name") ?? "",
        }
      }

      return { kind: "lyric", blockIdx: bIdx }
    },
    [],
  )

  /**
   * Posa el cursor a la posició del clic (per als menús "insert" que
   * necessiten saber on inserir).
   */
  const placeCursorAtClick = useCallback((x: number, y: number) => {
    type DocWithCaret = Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const doc = document as DocWithCaret
    const sel = window.getSelection()
    if (!sel) return

    if (typeof doc.caretRangeFromPoint === "function") {
      const range = doc.caretRangeFromPoint(x, y)
      if (range) {
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
    }
    if (typeof doc.caretPositionFromPoint === "function") {
      const cp = doc.caretPositionFromPoint(x, y)
      if (cp) {
        const range = document.createRange()
        range.setStart(cp.offsetNode, cp.offset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }, [])

  /**
   * Obre el menú adequat per a un clic curt (post-mouseup, sense drag).
   * Reuneix la lògica que abans estava al `handleMouseDown` directament.
   */
  const openMenuForClick = useCallback(
    (button: number, clientX: number, clientY: number, target: EventTarget | null) => {
      const info = inspectTarget(target)
      placeCursorAtClick(clientX, clientY)

      if (button === 1) {
        // Botó mig: menú de seccions. Tanca el menú d'acords si està obert.
        setChordMenu((m) => ({ ...m, open: false }))
        if (info.kind === "section") {
          setSectionMenu({
            open: true,
            x: clientX,
            y: clientY,
            mode: "modify",
            currentName: info.sectionName,
            blockIdx: info.blockIdx,
          })
        } else {
          setSectionMenu({
            open: true,
            x: clientX,
            y: clientY,
            mode: "insert",
            blockIdx: info.blockIdx,
          })
        }
        return
      }

      if (button === 2) {
        // Botó dret: menú d'acords si sobre acord o lletra; menú secció si sobre secció.
        if (info.kind === "chord") {
          // Tancar qualsevol menú de seccions obert per evitar superposicions.
          setSectionMenu((m) => ({ ...m, open: false }))
          setChordMenu({
            open: true,
            x: clientX,
            y: clientY,
            mode: "modify",
            currentChord: info.chord,
            blockIdx: info.blockIdx,
            spanIdx: info.spanIdx,
          })
        } else if (info.kind === "section") {
          // Clic dret sobre secció = menú modificar secció.
          setChordMenu((m) => ({ ...m, open: false }))
          setSectionMenu({
            open: true,
            x: clientX,
            y: clientY,
            mode: "modify",
            currentName: info.sectionName,
            blockIdx: info.blockIdx,
          })
        } else {
          // Sobre lletra/empty: menú d'inserció d'acord.
          setSectionMenu((m) => ({ ...m, open: false }))
          setChordMenu({
            open: true,
            x: clientX,
            y: clientY,
            mode: "insert",
            blockIdx: info.blockIdx,
          })
        }
      }
    },
    [inspectTarget, placeCursorAtClick],
  )

  /**
   * Comprova si el target és un acord o secció arrossegable.
   * Retorna el DragTarget corresponent o null.
   */
  const detectDraggable = useCallback(
    (target: EventTarget | null): DragTarget | null => {
      const container = containerRef.current
      if (!container || !(target instanceof Node)) return null

      // Pujar fins a trobar un span d'acord o un bloc de secció
      let cur: Node | null = target
      while (cur && cur !== container) {
        if (cur instanceof HTMLElement) {
          if (cur.hasAttribute("data-chord")) {
            const block = findBlockAncestor(cur, container)
            if (!block) return null
            const bIdx = blockIndex(block)
            if (bIdx < 0) return null
            // Trobar índex de l'span dins el bloc (entre tots els spans)
            const spanIdx = Array.from(block.childNodes).indexOf(cur)
            if (spanIdx < 0) return null
            // L'spanIdxInBlock ha de ser l'índex dins block.spans del Doc.
            // Calculem comptant només els nodes que reflecteixen spans Inline.
            const doc = docRef.current
            const docBlock = doc.blocks[bIdx]
            if (!docBlock || docBlock.kind !== "lyric") return null
            // Comptem ordinal de l'acord (n-th data-chord dins block.children)
            // i el mapegem al n-th element de tipus "chord" dins block.spans.
            const chordsInDom = Array.from(block.children).filter(
              (c) => c instanceof HTMLElement && c.hasAttribute("data-chord"),
            )
            const chordOrdinal = chordsInDom.indexOf(cur as HTMLElement)
            if (chordOrdinal < 0) return null
            let seen = -1
            let spanIdxInBlock = -1
            for (let i = 0; i < docBlock.spans.length; i++) {
              const s = docBlock.spans[i]
              if (s && s.kind === "chord") {
                seen++
                if (seen === chordOrdinal) {
                  spanIdxInBlock = i
                  break
                }
              }
            }
            if (spanIdxInBlock < 0) return null
            return {
              kind: "chord",
              blockIdx: bIdx,
              spanIdxInBlock,
              chord: cur.getAttribute("data-chord") ?? "",
            }
          }
          if (
            cur.hasAttribute("data-block") &&
            cur.getAttribute("data-block") === "section"
          ) {
            const bIdx = blockIndex(cur)
            if (bIdx < 0) return null
            return {
              kind: "section",
              blockIdx: bIdx,
              name: cur.getAttribute("data-section-name") ?? "",
            }
          }
        }
        cur = cur.parentNode
      }
      return null
    },
    [],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Comprovem si l'usuari ha premut sobre un node atòmic arrossegable
      // (acord o secció). Si sí, entrem en mode "pending": ni obrim menú ni
      // deixem que el navegador iniciï una selecció — la decisió clic vs
      // drag es resol a mouseup (threshold 5px).
      const draggable = detectDraggable(e.target)

      if (draggable) {
        e.preventDefault()
        dragStateRef.current = {
          mode: "pending",
          button: e.button,
          startX: e.clientX,
          startY: e.clientY,
          target: draggable,
        }
        return
      }

      // No és arrossegable. Botó esquerre: deixem comportament normal
      // (selecció de text natiu).
      if (e.button === 0) return

      // Botó mig o dret sobre lletra/empty: tampoc dràgable; obrim el menú
      // ara mateix (no hi ha drag possible des d'aquí).
      e.preventDefault()
      openMenuForClick(e.button, e.clientX, e.clientY, e.target)
    },
    [detectDraggable, openMenuForClick],
  )

  // ── Drag-and-drop: listeners globals ───────────────────────────────────────

  /**
   * Crea el ghost flotant (segueix el cursor) i el drop indicator.
   * Estils inline mínims perquè el comportament sigui visible encara que el
   * CSS global no estigui acabat (Fase 10).
   */
  const createGhostElement = useCallback((label: string): HTMLDivElement => {
    const ghost = document.createElement("div")
    ghost.className = "wysiwyg-drag-ghost"
    ghost.textContent = label
    ghost.style.position = "fixed"
    ghost.style.pointerEvents = "none"
    ghost.style.zIndex = "9999"
    ghost.style.padding = "2px 6px"
    ghost.style.background = "rgba(0, 0, 0, 0.75)"
    ghost.style.color = "#fff"
    ghost.style.borderRadius = "3px"
    ghost.style.fontSize = "12px"
    ghost.style.opacity = "0.9"
    ghost.style.left = "-9999px"
    ghost.style.top = "-9999px"
    document.body.appendChild(ghost)
    return ghost
  }, [])

  const createIndicatorElement = useCallback(
    (kind: "chord" | "section"): HTMLDivElement => {
      const ind = document.createElement("div")
      ind.className = `wysiwyg-drop-indicator ${kind}`
      ind.style.position = "fixed"
      ind.style.pointerEvents = "none"
      ind.style.zIndex = "9998"
      if (kind === "chord") {
        ind.style.width = "2px"
        ind.style.background = "var(--accent, #2a7be4)"
      } else {
        ind.style.height = "2px"
        ind.style.background = "var(--accent, #2a7be4)"
      }
      ind.style.left = "-9999px"
      ind.style.top = "-9999px"
      document.body.appendChild(ind)
      return ind
    },
    [],
  )

  /**
   * Obté la posició de drop per al drag d'un acord donat el client (x, y).
   * Usa caretPositionFromPoint/caretRangeFromPoint per trobar la posició
   * textual més propera. Valida que el bloc destí sigui lyric (o empty).
   */
  const computeChordDropPos = useCallback(
    (clientX: number, clientY: number): DropPosition | null => {
      const container = containerRef.current
      if (!container) return null

      type DocWithCaret = Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
      }
      const docApi = document as DocWithCaret

      let node: Node | null = null
      let offset = 0
      if (typeof docApi.caretRangeFromPoint === "function") {
        const range = docApi.caretRangeFromPoint(clientX, clientY)
        if (range) {
          node = range.startContainer
          offset = range.startOffset
        }
      } else if (typeof docApi.caretPositionFromPoint === "function") {
        const cp = docApi.caretPositionFromPoint(clientX, clientY)
        if (cp) {
          node = cp.offsetNode
          offset = cp.offset
        }
      }
      if (!node) return null

      const block = findBlockAncestor(node, container)
      if (!block) return null
      const bIdx = blockIndex(block)
      if (bIdx < 0) return null

      const kind = block.getAttribute("data-block")
      if (kind === "section") {
        return { kind: "chord-pos", blockIdx: bIdx, charOffset: 0, valid: false }
      }
      // empty: vàlid (es convertirà a lyric en commit)
      if (kind === "empty") {
        return { kind: "chord-pos", blockIdx: bIdx, charOffset: 0, valid: true }
      }

      const charOffset = computeCharOffsetInBlock(block, node, offset)
      return { kind: "chord-pos", blockIdx: bIdx, charOffset, valid: true }
    },
    [],
  )

  /**
   * Obté la posició d'inserció per al drag d'una secció: una posició
   * "entre blocs" calculada per la coordenada Y respecte al centre vertical
   * de cada bloc.
   */
  const computeSectionDropPos = useCallback(
    (_clientX: number, clientY: number): DropPosition | null => {
      const container = containerRef.current
      if (!container) return null
      const children = Array.from(container.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement,
      )
      if (children.length === 0) {
        return { kind: "section-between", insertIdx: 0 }
      }
      // Si està per sobre del primer
      const firstRect = children[0]!.getBoundingClientRect()
      if (clientY < firstRect.top + firstRect.height / 2) {
        return { kind: "section-between", insertIdx: 0 }
      }
      // Recorre i troba el primer bloc on clientY sigui per sota del seu centre
      for (let i = 0; i < children.length; i++) {
        const rect = children[i]!.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        if (clientY < mid) {
          return { kind: "section-between", insertIdx: i }
        }
      }
      return { kind: "section-between", insertIdx: children.length }
    },
    [],
  )

  /**
   * Actualitza la posició visual del drop indicator donat un DropPosition.
   */
  const updateIndicatorPosition = useCallback(
    (
      indicator: HTMLDivElement,
      drop: DropPosition | null,
      dragKind: "chord" | "section",
    ) => {
      const container = containerRef.current
      if (!container) return

      if (!drop) {
        indicator.style.left = "-9999px"
        indicator.style.top = "-9999px"
        return
      }

      if (drop.kind === "chord-pos") {
        // Marcar com a invàlid si toca
        if (drop.valid) {
          indicator.classList.remove("invalid")
          indicator.style.background = "var(--accent, #2a7be4)"
        } else {
          indicator.classList.add("invalid")
          indicator.style.background = "#d33"
        }
        // Trobar l'span de text on cau el charOffset i posar la línia just al límit
        const blocks = container.querySelectorAll("[data-block]")
        let blockEl: HTMLElement | null = null
        for (const b of Array.from(blocks)) {
          if (b instanceof HTMLElement && blockIndex(b) === drop.blockIdx) {
            blockEl = b
            break
          }
        }
        if (!blockEl) {
          indicator.style.left = "-9999px"
          return
        }

        // Cas section/empty: posa la línia al centre del bloc
        if (
          blockEl.getAttribute("data-block") === "section" ||
          blockEl.getAttribute("data-block") === "empty"
        ) {
          const rect = blockEl.getBoundingClientRect()
          indicator.style.left = `${rect.left}px`
          indicator.style.top = `${rect.top}px`
          indicator.style.height = `${rect.height}px`
          indicator.style.width = "2px"
          return
        }

        // Bloc lyric: trobar el lloc dins el flow textual
        let acc = 0
        let placed = false
        const blockRect = blockEl.getBoundingClientRect()
        for (const child of Array.from(blockEl.childNodes)) {
          if (!(child instanceof HTMLElement)) continue
          if (child.hasAttribute("data-chord")) continue
          if (!child.hasAttribute("data-text")) continue
          const len = (child.textContent ?? "").length
          if (drop.charOffset <= acc + len) {
            const local = drop.charOffset - acc
            const tn = child.firstChild
            if (tn && tn.nodeType === Node.TEXT_NODE) {
              const range = document.createRange()
              range.setStart(tn, Math.min(local, len))
              range.collapse(true)
              const rect = range.getBoundingClientRect()
              indicator.style.left = `${rect.left}px`
              indicator.style.top = `${rect.top}px`
              indicator.style.height = `${rect.height || blockRect.height}px`
              indicator.style.width = "2px"
              placed = true
            }
            break
          }
          acc += len
        }
        if (!placed) {
          // Al final del bloc
          indicator.style.left = `${blockRect.right}px`
          indicator.style.top = `${blockRect.top}px`
          indicator.style.height = `${blockRect.height}px`
          indicator.style.width = "2px"
        }
        return
      }

      if (drop.kind === "section-between") {
        indicator.classList.remove("invalid")
        indicator.style.background = "var(--accent, #2a7be4)"
        const children = Array.from(container.children).filter(
          (c): c is HTMLElement => c instanceof HTMLElement,
        )
        let top: number
        let left: number
        let width: number
        if (children.length === 0) {
          const rect = container.getBoundingClientRect()
          top = rect.top
          left = rect.left
          width = rect.width
        } else if (drop.insertIdx === 0) {
          const rect = children[0]!.getBoundingClientRect()
          top = rect.top
          left = rect.left
          width = rect.width
        } else if (drop.insertIdx >= children.length) {
          const rect = children[children.length - 1]!.getBoundingClientRect()
          top = rect.bottom
          left = rect.left
          width = rect.width
        } else {
          const prev = children[drop.insertIdx - 1]!.getBoundingClientRect()
          const next = children[drop.insertIdx]!.getBoundingClientRect()
          top = (prev.bottom + next.top) / 2
          left = Math.min(prev.left, next.left)
          width = Math.max(prev.width, next.width)
          void dragKind
        }
        indicator.style.left = `${left}px`
        indicator.style.top = `${top - 1}px`
        indicator.style.width = `${width}px`
        indicator.style.height = "2px"
      }
    },
    [],
  )

  /**
   * Acaba el drag (cancel·la o aplica). Treu ghost/indicator i reseteja.
   * Si `apply` és true i hi ha drop vàlid, aplica al Doc.
   */
  const finishDrag = useCallback(
    (apply: boolean) => {
      const st = dragStateRef.current
      if (st.mode !== "dragging") {
        dragStateRef.current = { mode: "idle" }
        return
      }
      // Treu el ghost i l'indicator del DOM
      if (st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost)
      if (st.indicator.parentNode) {
        st.indicator.parentNode.removeChild(st.indicator)
      }

      if (apply && st.dropPos) {
        const drop = st.dropPos
        const doc = docRef.current

        if (st.target.kind === "chord") {
          if (drop.kind === "chord-pos" && drop.valid) {
            const next = moveChordInDoc(
              doc,
              {
                blockIdx: st.target.blockIdx,
                spanIdxInBlock: st.target.spanIdxInBlock,
              },
              { blockIdx: drop.blockIdx, charOffset: drop.charOffset },
            )
            if (next !== doc) {
              commitDoc(
                next,
                { blockIdx: drop.blockIdx, charOffset: drop.charOffset },
                true,
              )
            }
          }
        } else if (st.target.kind === "section") {
          if (drop.kind === "section-between") {
            const next = moveSectionInDoc(
              doc,
              st.target.blockIdx,
              drop.insertIdx,
            )
            if (next !== doc) {
              commitDoc(next, null, true)
            }
          }
        }
      }

      dragStateRef.current = { mode: "idle" }
    },
    [commitDoc],
  )

  /**
   * Listeners globals de mousemove/mouseup/keydown actius mentre hi ha
   * un drag pending o en marxa. Adjuntats a `window` per capturar
   * moviments fora del contenidor.
   */
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const st = dragStateRef.current
      if (st.mode === "idle") return

      if (st.mode === "pending") {
        const dx = e.clientX - st.startX
        const dy = e.clientY - st.startY
        if (dx * dx + dy * dy < 25) return // < 5px, encara pending

        // Transició a "dragging": crea ghost i indicator.
        const label =
          st.target.kind === "chord"
            ? st.target.chord
            : `— ${st.target.name} —`
        const ghost = createGhostElement(label)
        const indicator = createIndicatorElement(
          st.target.kind === "chord" ? "chord" : "section",
        )

        // Cancel·la qualsevol selecció de text iniciada pel navegador
        const sel = window.getSelection()
        if (sel) sel.removeAllRanges()

        // Si hi havia un menú obert pel botó mig/dret, tanca'l (no havíem
        // d'obrir-lo, però per defensiva).
        setSectionMenu((m) => (m.open ? { ...m, open: false } : m))
        setChordMenu((m) => (m.open ? { ...m, open: false } : m))

        dragStateRef.current = {
          mode: "dragging",
          button: st.button,
          target: st.target,
          ghost,
          indicator,
          dropPos: null,
        }
      }

      const cur = dragStateRef.current
      if (cur.mode !== "dragging") return

      // Actualitza posició del ghost (DOM directe)
      cur.ghost.style.left = `${e.clientX + 8}px`
      cur.ghost.style.top = `${e.clientY + 8}px`

      // Calcula drop position i actualitza indicador
      let drop: DropPosition | null
      if (cur.target.kind === "chord") {
        drop = computeChordDropPos(e.clientX, e.clientY)
      } else {
        drop = computeSectionDropPos(e.clientX, e.clientY)
      }
      cur.dropPos = drop
      updateIndicatorPosition(
        cur.indicator,
        drop,
        cur.target.kind === "chord" ? "chord" : "section",
      )
    }

    const onUp = (e: MouseEvent): void => {
      const st = dragStateRef.current
      if (st.mode === "idle") return

      if (st.mode === "pending") {
        // Clic curt sobre acord/secció (qualsevol botó: esq/mig/dret):
        // obre el menú modify corresponent. El drag continua funcionant
        // per a qualsevol botó si s'ha mogut > 5px.
        const { target } = st
        dragStateRef.current = { mode: "idle" }

        if (target.kind === "chord") {
          // Convertim spanIdxInBlock (índex absolut a block.spans) a ordinal
          // d'acord dins el bloc (que és el que espera el menú).
          const doc = docRef.current
          const dblock = doc.blocks[target.blockIdx]
          let ordinal = -1
          if (dblock && dblock.kind === "lyric") {
            let seen = -1
            for (let i = 0; i < dblock.spans.length; i++) {
              const s = dblock.spans[i]
              if (s && s.kind === "chord") {
                seen++
                if (i === target.spanIdxInBlock) {
                  ordinal = seen
                  break
                }
              }
            }
          }
          setSectionMenu((m) => ({ ...m, open: false }))
          setChordMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            mode: "modify",
            currentChord: target.chord,
            blockIdx: target.blockIdx,
            spanIdx: ordinal >= 0 ? ordinal : 0,
          })
        } else {
          setChordMenu((m) => ({ ...m, open: false }))
          setSectionMenu({
            open: true,
            x: e.clientX,
            y: e.clientY,
            mode: "modify",
            currentName: target.name,
            blockIdx: target.blockIdx,
          })
        }
        return
      }

      if (st.mode === "dragging") {
        finishDrag(true)
      }
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const st = dragStateRef.current
        if (st.mode === "dragging") {
          e.preventDefault()
          finishDrag(false)
        } else if (st.mode === "pending") {
          dragStateRef.current = { mode: "idle" }
        }
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [
    createGhostElement,
    createIndicatorElement,
    computeChordDropPos,
    computeSectionDropPos,
    updateIndicatorPosition,
    finishDrag,
  ])

  // ── Callbacks dels menús ───────────────────────────────────────────────────

  const insertSectionAtBlockIdx = useCallback(
    (blockIdx: number, name: string) => {
      const doc = docRef.current
      const blocks = doc.blocks.slice()
      const safeIdx = Math.max(0, Math.min(blockIdx, blocks.length))
      blocks.splice(safeIdx, 0, { kind: "section", name })
      commitDoc(
        { blocks },
        { blockIdx: safeIdx + 1, charOffset: 0 },
        true,
      )
    },
    [commitDoc],
  )

  const handleSectionInsert = useCallback(
    (name: string) => {
      const blockIdx = sectionMenu.blockIdx ?? 0
      insertSectionAtBlockIdx(blockIdx, name)
      setSectionMenu((m) => ({ ...m, open: false }))
    },
    [sectionMenu.blockIdx, insertSectionAtBlockIdx],
  )

  const handleSectionModify = useCallback(
    (newName: string) => {
      const blockIdx = sectionMenu.blockIdx
      if (blockIdx === undefined) return
      const doc = docRef.current
      const blocks = doc.blocks.slice()
      const block = blocks[blockIdx]
      if (!block || block.kind !== "section") return
      blocks[blockIdx] = { kind: "section", name: newName }
      commitDoc({ blocks }, null, true)
    },
    [sectionMenu.blockIdx, commitDoc],
  )

  const handleSectionDelete = useCallback(() => {
    const blockIdx = sectionMenu.blockIdx
    if (blockIdx === undefined) return
    const doc = docRef.current
    const blocks = doc.blocks.slice()
    const block = blocks[blockIdx]
    if (!block || block.kind !== "section") return
    blocks.splice(blockIdx, 1)
    commitDoc({ blocks }, { blockIdx, charOffset: 0 }, true)
    setSectionMenu((m) => ({ ...m, open: false }))
  }, [sectionMenu.blockIdx, commitDoc])

  const insertChordAtPos = useCallback(
    (chord: string, pos: CursorPos | null) => {
      const container = containerRef.current
      if (!container) return
      const cursor = pos ?? readCursorPosition(container)
      if (!cursor) return
      const block = docRef.current.blocks[cursor.blockIdx]
      if (!block) return

      // Si el bloc és empty o section, intenta inserir al bloc anterior/posterior lyric
      let workDoc = docRef.current
      let target = cursor

      if (block.kind === "empty") {
        // Converteix l'empty a lyric per acollir l'acord
        const blocks = workDoc.blocks.slice()
        blocks[cursor.blockIdx] = { kind: "lyric", spans: [] }
        workDoc = { blocks }
      } else if (block.kind === "section") {
        // No insertem acords sobre seccions
        return
      }

      const out = insertChordInDoc(
        workDoc,
        target.blockIdx,
        target.charOffset,
        chord,
      )
      commitDoc(out, target, true)
    },
    [commitDoc],
  )

  const handleChordInsert = useCallback(
    (chord: string) => {
      insertChordAtPos(chord, null)
      setChordMenu((m) => ({ ...m, open: false }))
    },
    [insertChordAtPos],
  )

  const handleChordModify = useCallback(
    (newChord: string) => {
      const blockIdx = chordMenu.blockIdx
      const spanIdx = chordMenu.spanIdx
      if (blockIdx === undefined || spanIdx === undefined) return
      const doc = docRef.current
      const block = doc.blocks[blockIdx]
      if (!block || block.kind !== "lyric") return

      // L'spanIdx és sobre la sublista de chords; trobem l'índex real
      const blocks = doc.blocks.slice()
      const newSpans = block.spans.slice()
      let chordSeen = -1
      for (let i = 0; i < newSpans.length; i++) {
        const s = newSpans[i]
        if (!s || s.kind !== "chord") continue
        chordSeen++
        if (chordSeen === spanIdx) {
          newSpans[i] = { kind: "chord", chord: newChord }
          break
        }
      }
      blocks[blockIdx] = { kind: "lyric", spans: newSpans }
      commitDoc({ blocks }, null, true)
    },
    [chordMenu.blockIdx, chordMenu.spanIdx, commitDoc],
  )

  const handleChordDelete = useCallback(() => {
    const blockIdx = chordMenu.blockIdx
    const spanIdx = chordMenu.spanIdx
    if (blockIdx === undefined || spanIdx === undefined) return
    const doc = docRef.current
    const block = doc.blocks[blockIdx]
    if (!block || block.kind !== "lyric") return

    const blocks = doc.blocks.slice()
    const newSpans: Inline[] = []
    let chordSeen = -1
    for (const s of block.spans) {
      if (s.kind === "chord") {
        chordSeen++
        if (chordSeen === spanIdx) continue
      }
      newSpans.push(s)
    }
    blocks[blockIdx] = {
      kind: "lyric",
      spans: mergeAdjacentText(newSpans),
    }
    commitDoc({ blocks }, null, true)
    setChordMenu((m) => ({ ...m, open: false }))
  }, [chordMenu.blockIdx, chordMenu.spanIdx, commitDoc])

  // ── Imperatives (exposades via ref) ────────────────────────────────────────

  useImperativeHandle(
    ref,
    (): WysiwygEditorHandle => ({
      insertChordAtCursor: (chord: string) => {
        insertChordAtPos(chord, null)
      },
      insertSectionAtCursor: (name: string) => {
        const container = containerRef.current
        if (!container) return
        const pos = readCursorPosition(container)
        const blockIdx = pos ? pos.blockIdx : docRef.current.blocks.length
        insertSectionAtBlockIdx(blockIdx, name)
      },
      getContainer: () => containerRef.current,
      focus: () => {
        containerRef.current?.focus()
      },
      openSectionMenuAtCursor: () => {
        const container = containerRef.current
        if (!container) return
        const { x, y } = getCursorOrContainerAnchor(container)
        setSectionMenu({ open: true, x, y, mode: "insert" })
      },
      openChordMenuAtCursor: () => {
        const container = containerRef.current
        if (!container) return
        const { x, y } = getCursorOrContainerAnchor(container)
        setChordMenu({ open: true, x, y, mode: "insert" })
      },
    }),
    [insertChordAtPos, insertSectionAtBlockIdx],
  )

  // Listener natiu de beforeinput. Necessari perquè React no propaga aquest
  // event de forma fiable en contentEditable a tots els navegadors.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = (e: Event) => handleBeforeInput(e as InputEvent)
    container.addEventListener("beforeinput", handler)
    return () => container.removeEventListener("beforeinput", handler)
  }, [handleBeforeInput])

  // Marca visual de l'acord o secció que s'està modificant. S'aplica després
  // que el DOM s'hagi sincronitzat (depèn de `value` perquè es re-apliqui en
  // qualsevol re-render del Doc). Quan el menú es tanca, es treu la marca.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Neteja qualsevol marca anterior
    container.querySelectorAll(".wch--editing").forEach((el) => {
      el.classList.remove("wch--editing")
    })
    container.querySelectorAll(".wsec--editing").forEach((el) => {
      el.classList.remove("wsec--editing")
    })

    // Acord en modificació: trobem el bloc i el n-èsim span d'acord
    if (
      chordMenu.open &&
      chordMenu.mode === "modify" &&
      chordMenu.blockIdx !== undefined &&
      chordMenu.spanIdx !== undefined
    ) {
      const blocks = container.querySelectorAll("[data-block]")
      for (const b of Array.from(blocks)) {
        if (
          b instanceof HTMLElement &&
          blockIndex(b) === chordMenu.blockIdx
        ) {
          const chords = Array.from(b.children).filter(
            (c) => c instanceof HTMLElement && c.hasAttribute("data-chord"),
          ) as HTMLElement[]
          const target = chords[chordMenu.spanIdx]
          if (target) target.classList.add("wch--editing")
          break
        }
      }
    }

    // Secció en modificació
    if (
      sectionMenu.open &&
      sectionMenu.mode === "modify" &&
      sectionMenu.blockIdx !== undefined
    ) {
      const blocks = container.querySelectorAll("[data-block]")
      for (const b of Array.from(blocks)) {
        if (
          b instanceof HTMLElement &&
          blockIndex(b) === sectionMenu.blockIdx
        ) {
          const inner = b.querySelector(".wsec")
          if (inner) inner.classList.add("wsec--editing")
          break
        }
      }
    }
  }, [chordMenu, sectionMenu, value])

  // ── Render ─────────────────────────────────────────────────────────────────

  const disabled = !!disabledReason

  return (
    <div
      className={`wysiwyg-editor-wrap${disabled ? " wysiwyg-editor-wrap--disabled" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={containerRef}
        className="wysiwyg-editor"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onAuxClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onCut={handleCut}
        spellCheck={false}
        aria-disabled={disabled || undefined}
      />
      {disabled ? (
        <div className="wysiwyg-placeholder wysiwyg-placeholder--disabled">
          {disabledReason}
        </div>
      ) : (
        isEmpty &&
        placeholder && (
          <div className="wysiwyg-placeholder">{placeholder}</div>
        )
      )}

      <SectionContextMenu
        open={sectionMenu.open}
        x={sectionMenu.x}
        y={sectionMenu.y}
        mode={sectionMenu.mode}
        existingSectionNames={existingSectionNames}
        currentName={sectionMenu.currentName}
        onInsert={handleSectionInsert}
        onModify={handleSectionModify}
        onDelete={handleSectionDelete}
        onClose={() => setSectionMenu((m) => ({ ...m, open: false }))}
      />
      <ChordContextMenu
        open={chordMenu.open}
        x={chordMenu.x}
        y={chordMenu.y}
        mode={chordMenu.mode}
        chordKey={chordKey}
        currentChord={chordMenu.currentChord}
        onInsert={handleChordInsert}
        onModify={handleChordModify}
        onDelete={handleChordDelete}
        onClose={() => setChordMenu((m) => ({ ...m, open: false }))}
      />
    </div>
  )
})

// ── Utilitats ─────────────────────────────────────────────────────────────────

/**
 * Retorna la posició viewport del cursor actual si està dins el contenidor;
 * altrament, retorna el centre superior del contenidor. Usat per ancorar
 * menús contextuals invocats des de la toolbar.
 */
function getCursorOrContainerAnchor(
  container: HTMLElement,
): { x: number; y: number } {
  const sel = typeof window !== "undefined" ? window.getSelection() : null
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    // Verifiquem que la selecció és dins el contenidor de l'editor.
    if (container.contains(range.startContainer)) {
      const rect = range.getBoundingClientRect()
      // Una selecció col·lapsada pot donar un rect amb width=0 i height=0
      // si està al final d'una línia buida. Fallback al primer fill.
      if (rect.width > 0 || rect.height > 0 || rect.x !== 0 || rect.y !== 0) {
        return { x: rect.left, y: rect.bottom + 4 }
      }
    }
  }
  // Fallback: cantonada superior-esquerra del primer bloc, o del contenidor.
  const firstBlock = container.firstElementChild as HTMLElement | null
  const rect = (firstBlock ?? container).getBoundingClientRect()
  return { x: rect.left + 16, y: rect.top + 16 }
}

/** Tanca la posició dins un rang vàlid del Doc. */
function clampPos(pos: CursorPos, doc: Doc): CursorPos {
  if (doc.blocks.length === 0) return { blockIdx: 0, charOffset: 0 }
  const safeBlockIdx = Math.max(
    0,
    Math.min(pos.blockIdx, doc.blocks.length - 1),
  )
  const block = doc.blocks[safeBlockIdx]
  if (!block) return { blockIdx: safeBlockIdx, charOffset: 0 }
  const maxOffset = block.kind === "lyric" ? blockTextLength(block) : 0
  return {
    blockIdx: safeBlockIdx,
    charOffset: Math.max(0, Math.min(pos.charOffset, maxOffset)),
  }
}
