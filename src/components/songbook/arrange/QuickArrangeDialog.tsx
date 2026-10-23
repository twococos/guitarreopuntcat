"use client"
/**
 * QuickArrangeDialog — «Arranjament ràpid» d'una cançó del cançoner (§22).
 *
 * Diàleg sobre l'editor de cançoners (fons difuminat) amb la cançó partida en targetes per
 * secció i una paleta d'eines: moure (arrossegar), repetir, treure i goma (paraules, acords o
 * versos sencers). El resultat és una recepta (src/lib/arrangement/) que es desa a l'entrada
 * del cançoner; no és cap cançó nova. Per a arranjaments més complicats, l'editor complet.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useSongbookStore, type CanconerEntry } from "@/hooks/useSongbook"
import { useEditorHistory } from "@/hooks/useEditorHistory"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"
import { parse, type Doc } from "@/lib/editor/model"
import { toLineModel } from "@/lib/reports/apply"
import { normalizeContent, splitSections, type QuickArrangement, type Section } from "@/lib/arrangement/apply"
import {
  editableArrangement,
  identityArrangement,
  isIdentity,
  missingSections,
  moveItem,
  removeItem,
  repeatItem,
  restoreSection,
  toggleChord,
  toggleLine,
  toggleText,
} from "@/lib/arrangement/edit"
import { renderSectionBody } from "@/lib/arrangement/render"
import { caretFromPoint, selectionBoxes, wordBounds, type Sel } from "@/components/reports/selection"
import type { AccidentalMap } from "@/lib/transpose"
import {
  IconEraser,
  IconGrip,
  IconList,
  IconMove,
  IconOpen,
  IconRedo,
  IconRepeat,
  IconRotateCcw,
  IconTrash,
  IconUndo,
  IconX,
} from "@/components/shared/Icons"

type Tool = "move" | "repeat" | "remove" | "erase"

interface ToolDef {
  id: Tool
  label: "moure" | "repetir" | "treure" | "goma"
  icon: (p: { className?: string }) => React.ReactNode
}

/** Eines de seccions (la targeta sencera) i de lletra (dins les seccions). */
const SECTION_TOOLS: ToolDef[] = [
  { id: "move", label: "moure", icon: IconMove },
  { id: "repeat", label: "repetir", icon: IconRepeat },
  { id: "remove", label: "treure", icon: IconTrash },
]
const LYRIC_TOOLS: ToolDef[] = [{ id: "erase", label: "goma", icon: IconEraser }]
const TOOLS = [...SECTION_TOOLS, ...LYRIC_TOOLS]

/** Les targetes només es mouen amunt i avall (com la llista del cançoner). */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** Només translació: amb CSS.Transform, dnd-kit escala la targeta a la mida de la que substitueix. */
function translate(t: { x: number; y: number } | null): string | undefined {
  return t ? `translate3d(0, ${Math.round(t.y)}px, 0)` : undefined
}

/** Muntat un sol cop a l'editor de cançoners; s'obre amb `openArrange(idx)` del store. */
export function QuickArrangeDialog() {
  const idx = useSongbookStore((s) => s.arrangeIdx)
  const entry = useSongbookStore((s) => (s.arrangeIdx === null ? null : (s.canconer[s.arrangeIdx] ?? null)))
  if (idx === null || !entry) return null
  return <Arranger key={`${idx}-${entry.song.id}`} idx={idx} entry={entry} />
}

function Arranger({ idx, entry }: { idx: number; entry: CanconerEntry }) {
  const t = getT()
  const tq = t.app.songbook.quickArrange
  const close = useSongbookStore((s) => s.closeArrange)
  const setArrangement = useSongbookStore((s) => s.setArrangement)
  const notation = useSongbookStore((s) => s.pdfOptions.notation)

  const content = useMemo(() => normalizeContent(entry.song.content ?? ""), [entry.song.content])
  const doc = useMemo(() => parse(content), [content])
  const sections = useMemo(() => new Map(splitSections(doc).map((s) => [s.sec, s])), [doc])
  const initial = useMemo(() => editableArrangement(content, entry.arrangement), [content, entry.arrangement])
  const initialStr = useMemo(() => JSON.stringify(initial.qa), [initial])
  const history = useEditorHistory(initialStr)
  const qa = useMemo(() => JSON.parse(history.value) as QuickArrangement, [history.value])
  const dirty = history.value !== initialStr
  const [tool, setTool] = useState<Tool>("move")
  const [confirmClose, setConfirmClose] = useState(false)

  const apply = useCallback((next: QuickArrangement) => history.commit(JSON.stringify(next)), [history])

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true)
    else close()
  }, [dirty, close])

  function save() {
    const value = isIdentity(content, qa) ? null : qa
    setArrangement(idx, value)
    useToastStore.getState().show(value ? tq.desat : tq.tretArranjament)
    close()
  }

  function openEditor() {
    if (entry.arrangement || dirty) useToastStore.getState().show(tq.obreEditorAvis)
    window.open(`/app/editor?id=${entry.song.id}`, "_blank", "noopener")
  }

  // Escape tanca; Ctrl+Z / Ctrl+Maj+Z (o Ctrl+Y) desfan i refan; l'scroll de la pàgina, bloquejat
  const historyRef = useRef(history)
  historyRef.current = history
  useEffect(() => {
    document.body.classList.add("qa-dialog-open")
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        requestClose()
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === "z" && !e.shiftKey) {
        e.preventDefault()
        historyRef.current.undo()
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault()
        historyRef.current.redo()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("qa-dialog-open")
      document.removeEventListener("keydown", onKey)
    }
  }, [requestClose])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = qa.items.map((_, i) => `qa-${i}`)
  const mapIds = qa.items.map((_, i) => `qa-map-${i}`)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState<number | null>(null)
  /** Clic a l'estructura: porta la targeta a la vista i la destaca un moment. */
  function focusItem(i: number) {
    sheetRef.current?.querySelector(`[data-qa-item="${i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    setFlash(i)
    window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 900)
  }
  function onDragEnd(e: DragEndEvent, prefix: string) {
    if (!e.over) return
    const from = Number(String(e.active.id).slice(prefix.length))
    const to = Number(String(e.over.id).slice(prefix.length))
    if (from !== to) apply(moveItem(qa, from, to))
  }

  const missing = missingSections(content, qa)
  const nameOf = (sec: number, name: string) => (sec < 0 ? tq.inici : name)
  const toolDef = TOOLS.find((x) => x.id === tool) ?? TOOLS[0]
  const toolHint = tq.eina[`${toolDef.label}Hint`]
  const group = tool === "erase" ? "lyrics" : "sections"
  const toolButton = ({ id, label, icon: Icon }: ToolDef) => (
    <button
      key={id}
      type="button"
      className={`qa-tool${tool === id ? " is-active" : ""}`}
      onClick={() => setTool(id)}
      aria-pressed={tool === id}
      title={tq.eina[`${label}Hint`]}
    >
      <Icon className="qa-tool-icon" />
      <span className="qa-tool-label">{tq.eina[label]}</span>
    </button>
  )

  return (
    <div
      className="qa-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div className="qa-dialog" role="dialog" aria-modal="true" aria-label={tq.titol} data-tool={tool} data-group={group}>
        <header className="qa-head">
          <div className="qa-head-text">
            <h2 className="qa-title">{tq.titol}</h2>
            <p className="qa-song">
              <strong>{entry.song.title}</strong> · {entry.song.artist}
            </p>
          </div>
          <button type="button" className="qa-editor-link" onClick={openEditor} title={tq.obreEditorTitle}>
            <IconOpen /> {tq.obreEditor}
          </button>
          <button type="button" className="qa-close" onClick={requestClose} aria-label={tq.tancar} title={tq.tancar}>
            <IconX />
          </button>
        </header>

        <div className="qa-main">
          <div className="qa-palette" role="toolbar" aria-label={tq.eines}>
            <span className="qa-palette-group is-sections">{tq.grupSeccions}</span>
            {SECTION_TOOLS.map(toolButton)}
            <span className="qa-palette-group is-lyrics">{tq.grupLletra}</span>
            {LYRIC_TOOLS.map(toolButton)}
            <span className="qa-palette-sep" aria-hidden="true" />
            <button type="button" className="qa-tool" onClick={history.undo} disabled={!history.canUndo} title={`${tq.desfer} (Ctrl+Z)`}>
              <IconUndo className="qa-tool-icon" />
              <span className="qa-tool-label">{tq.desfer}</span>
            </button>
            <button type="button" className="qa-tool" onClick={history.redo} disabled={!history.canRedo} title={`${tq.refer} (Ctrl+Y)`}>
              <IconRedo className="qa-tool-icon" />
              <span className="qa-tool-label">{tq.refer}</span>
            </button>
          </div>

          <div className="qa-canvas">
            <p className={`qa-hint is-${group}`} role="status">
              <strong>{group === "lyrics" ? tq.grupLletra : tq.grupSeccions}</strong>
              <span>{toolHint}</span>
            </p>
            {initial.lost > 0 && <p className="qa-lost">{tq.perdudes(initial.lost)}</p>}
            <div ref={sheetRef} className="song qa-sheet" data-style="classic">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[verticalOnly]}
                onDragEnd={(e) => onDragEnd(e, "qa-")}
              >
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {qa.items.map((it, i) => {
                    const section = sections.get(it.sec)
                    if (!section) return null
                    return (
                      <SectionCard
                        key={ids[i]}
                        id={ids[i]}
                        index={i}
                        name={nameOf(it.sec, it.name)}
                        doc={doc}
                        section={section}
                        qa={qa}
                        tool={tool}
                        semitones={entry.semitones}
                        notation={notation}
                        content={content}
                        canRemove={qa.items.length > 1}
                        flash={flash === i}
                        onChange={apply}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            </div>

          </div>

          <aside className="qa-structure" aria-label={tq.mapa}>
            <h3 className="qa-structure-title">
              <IconList /> {tq.mapa}
            </h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[verticalOnly]}
              onDragEnd={(e) => onDragEnd(e, "qa-map-")}
            >
              <SortableContext items={mapIds} strategy={verticalListSortingStrategy}>
                <ol className="qa-structure-list">
                  {qa.items.map((it, i) => (
                    <StructureRow
                      key={mapIds[i]}
                      id={mapIds[i]}
                      label={nameOf(it.sec, it.name)}
                      edited={Boolean(it.erase?.length)}
                      canRemove={qa.items.length > 1}
                      onFocus={() => focusItem(i)}
                      onRepeat={() => apply(repeatItem(qa, i))}
                      onRemove={() => apply(removeItem(qa, i))}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {missing.length > 0 && (
              <div className="qa-tray">
                <span className="qa-tray-label" title={tq.tretesHint}>
                  {tq.tretes}
                </span>
                {missing.map((m) => (
                  <button
                    key={m.sec}
                    type="button"
                    className="qa-chip is-removed"
                    title={tq.tretesHint}
                    onClick={() => apply(restoreSection(content, qa, m.sec))}
                  >
                    + {nameOf(m.sec, m.name)}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>

        <footer className="qa-foot">
          {confirmClose ? (
            <div className="qa-confirm" role="alertdialog">
              <span>{tq.confirmTancar}</span>
              <button type="button" className="qa-btn" onClick={() => setConfirmClose(false)}>
                {tq.confirmTancarNo}
              </button>
              <button type="button" className="qa-btn qa-btn-danger" onClick={close}>
                {tq.confirmTancarSi}
              </button>
            </div>
          ) : (
            <div className="qa-actions">
              <button
                type="button"
                className="qa-btn qa-btn-ghost"
                onClick={() => apply(identityArrangement(content))}
                title={tq.restablirTitle}
              >
                <IconRotateCcw /> {tq.restablir}
              </button>
              <button type="button" className="qa-btn" onClick={requestClose}>
                {tq.cancellar}
              </button>
              <button type="button" className="qa-btn qa-btn-primary" onClick={save}>
                {tq.desar}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

/* ── Fila de l'estructura (índex de seccions) ────────────── */

function StructureRow({
  id,
  label,
  edited,
  canRemove,
  onFocus,
  onRepeat,
  onRemove,
}: {
  id: string
  label: string
  edited: boolean
  canRemove: boolean
  onFocus: () => void
  onRepeat: () => void
  onRemove: () => void
}) {
  const tq = getT().app.songbook.quickArrange
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      className={`qa-structure-row${edited ? " is-edited" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: translate(transform), transition: transition ?? undefined }}
    >
      <span className="qa-structure-grip" title={tq.arrossegaTitle} {...attributes} {...listeners}>
        <IconGrip />
      </span>
      <button type="button" className="qa-structure-name" onClick={onFocus} title={tq.veureSeccio}>
        {label}
        {edited && <span className="qa-structure-dot" title={tq.ambEsborrats} />}
      </button>
      <button type="button" className="qa-structure-btn" onClick={onRepeat} title={tq.repetirSeccio} aria-label={tq.repetirSeccio}>
        <IconRepeat />
      </button>
      <button
        type="button"
        className="qa-structure-btn is-danger"
        onClick={onRemove}
        disabled={!canRemove}
        title={tq.treureSeccio}
        aria-label={tq.treureSeccio}
      >
        <IconTrash />
      </button>
    </li>
  )
}

/* ── Targeta d'una secció ────────────────────────────────── */

interface CardProps {
  id: string
  index: number
  name: string
  doc: Doc
  section: Section
  qa: QuickArrangement
  tool: Tool
  semitones: number
  notation: AccidentalMap
  content: string
  canRemove: boolean
  flash: boolean
  onChange: (qa: QuickArrangement) => void
}

function SectionCard({ id, index, name, doc, section, qa, tool, semitones, notation, content, canRemove, flash, onChange }: CardProps) {
  const tq = getT().app.songbook.quickArrange
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: tool !== "move",
  })
  const erase = qa.items[index]?.erase
  const html = useMemo(
    () => renderSectionBody(doc, section, erase ?? [], { semitones, notation, lineTitle: tq.versTitle }),
    [doc, section, erase, semitones, notation, tq.versTitle],
  )

  const style: React.CSSProperties = {
    transform: translate(transform),
    transition: transition ?? undefined,
  }

  function onCardClick() {
    if (tool === "repeat") onChange(repeatItem(qa, index))
    else if (tool === "remove" && canRemove) onChange(removeItem(qa, index))
  }

  return (
    <fieldset
      ref={setNodeRef}
      style={style}
      className={`qa-sec${isDragging ? " is-dragging" : ""}${erase?.length ? " is-edited" : ""}${tool === "remove" && !canRemove ? " is-locked" : ""}${flash ? " is-flash" : ""}`}
      data-qa-item={index}
      onClick={onCardClick}
      {...(tool === "move" ? { ...attributes, ...listeners } : {})}
    >
      <legend className="qa-sec-name">{name}</legend>
      <EraserBody
        html={html}
        active={tool === "erase"}
        doc={doc}
        onLine={(b) => onChange(toggleLine(content, qa, index, b))}
        onChord={(b, ci) => onChange(toggleChord(content, qa, index, b, ci))}
        onText={(b, start, end) => onChange(toggleText(content, qa, index, b, start, end))}
      />
    </fieldset>
  )
}

/* ── Cos amb la goma ─────────────────────────────────────── */

const DRAG_THRESHOLD = 5

function EraserBody({
  html,
  active,
  doc,
  onLine,
  onChord,
  onText,
}: {
  html: string
  active: boolean
  doc: Doc
  onLine: (b: number) => void
  onChord: (b: number, ci: number) => void
  onText: (b: number, start: number, end: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ anchor: Sel; sel: Sel; x: number; y: number; moved: boolean } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [boxes, setBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const body = bodyRef.current
    setBoxes(sel && wrap && body ? selectionBoxes(wrap, sel, body) : [])
  }, [sel, html])

  const lineText = useCallback(
    (b: number) => {
      const block = doc.blocks[b]
      return block?.kind === "lyric" ? toLineModel(block.spans).text : null
    },
    [doc],
  )

  /** Paraula sota un punt de la pantalla (dins aquesta targeta). */
  const wordFromPoint = useCallback(
    (x: number, y: number): Sel | null => {
      const p = caretFromPoint(x, y)
      if (!p) return null
      const el = p.node.nodeType === Node.TEXT_NODE ? p.node.parentElement : (p.node as Element)
      if (!el || !bodyRef.current?.contains(el)) return null
      const tEl = el.closest<HTMLElement>(".rp-t")
      const lineEl = el.closest<HTMLElement>(".rp-line[data-b]")
      if (!tEl || !lineEl) return null
      const block = Number(lineEl.dataset.b)
      const text = lineText(block)
      if (text === null) return null
      const offset = Number(tEl.dataset.o) + (p.node.nodeType === Node.TEXT_NODE ? p.offset : 0)
      const w = wordBounds(text, offset)
      return w ? { block, ...w, text: text.slice(w.start, w.end) } : null
    },
    [lineText],
  )

  function onPointerDown(e: React.PointerEvent) {
    if (!active || e.button > 0) return
    const target = e.target as HTMLElement
    e.stopPropagation()
    const gutter = target.closest<HTMLElement>(".qa-gutter[data-b]")
    if (gutter) {
      e.preventDefault()
      onLine(Number(gutter.dataset.b))
      return
    }
    const ch = target.closest<HTMLElement>("ch[data-ci]")
    if (ch) {
      e.preventDefault()
      onChord(Number(ch.dataset.b), Number(ch.dataset.ci))
      return
    }
    const w = wordFromPoint(e.clientX, e.clientY)
    if (!w) return
    e.preventDefault()
    drag.current = { anchor: w, sel: w, x: e.clientX, y: e.clientY, moved: false }
    setSel(w)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return
    d.moved = true
    const w = wordFromPoint(e.clientX, e.clientY)
    if (!w || w.block !== d.anchor.block) return
    const start = Math.min(d.anchor.start, w.start)
    const end = Math.max(d.anchor.end, w.end)
    if (start === d.sel.start && end === d.sel.end) return
    d.sel = { block: d.anchor.block, start, end, text: (lineText(d.anchor.block) ?? "").slice(start, end) }
    setSel(d.sel)
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    setSel(null)
    if (d) onText(d.sel.block, d.sel.start, d.sel.end)
  }

  return (
    <div ref={wrapRef} className="qa-body-wrap">
      <div
        ref={bodyRef}
        className={`song-body qa-body${active ? " is-erasing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null
          setSel(null)
        }}
        onClick={(e) => {
          if (active) e.stopPropagation()
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {boxes.map((b, i) => (
        <span key={i} className="rp-sel-box qa-sel-box" style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
      ))}
    </div>
  )
}
