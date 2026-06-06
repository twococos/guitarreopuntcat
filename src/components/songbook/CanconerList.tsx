"use client"
import { useLayoutEffect, useRef } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useSongbookStore, type CanconerEntry } from "@/hooks/useSongbook"
import { transposeKey, respellAccidentals } from "@/lib/transpose"
import { getT } from "@/lib/i18n"
import { IconX } from "@/components/shared/Icons"

function SortableItem({ entry, idx }: { entry: CanconerEntry; idx: number }) {
  const t = getT()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.song.id,
  })
  const selected = useSongbookStore((s) => s.selectedIdx === idx)
  const setSelected = useSongbookStore((s) => s.setSelectedIdx)
  const bump = useSongbookStore((s) => s.bumpSemitones)
  const remove = useSongbookStore((s) => s.removeFromCanconer)
  const openKeyMenu = useSongbookStore((s) => s.openKeyMenu)
  const notation = useSongbookStore((s) => s.pdfOptions.notation)

  const currentKey = respellAccidentals(transposeKey(entry.song.key, entry.semitones), notation)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      data-song-id={entry.song.id}
      style={style}
      className={`${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`.trim()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".c-transpose, .c-remove")) return
        setSelected(idx)
      }}
      {...attributes}
      {...listeners}
    >
      <span className="c-num">{idx + 1}</span>
      <span className="c-title">{entry.song.title}</span>
      <span className="c-artist">{entry.song.artist}</span>
      <div className="c-transpose" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="c-pm c-btn-down"
          title={t.app.songbook.canconerList.menosUnSemitoTitle}
          onClick={(e) => {
            e.stopPropagation()
            bump(idx, -1)
          }}
        >
          −
        </button>
        <span
          className="c-key"
          title={t.app.songbook.canconerList.canviarTonalitatTitle}
          onClick={(e) => {
            e.stopPropagation()
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            openKeyMenu(idx, {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            })
          }}
        >
          {currentKey}
        </span>
        <button
          className="c-pm c-btn-up"
          title={t.app.songbook.canconerList.mesUnSemitoTitle}
          onClick={(e) => {
            e.stopPropagation()
            bump(idx, 1)
          }}
        >
          +
        </button>
      </div>
      <button
        className="c-remove"
        title={t.app.songbook.canconerList.treureTitle}
        onClick={(e) => {
          e.stopPropagation()
          remove(idx)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={t.app.songbook.canconerList.treureTitle}
      >
        <IconX />
      </button>
    </li>
  )
}

export function CanconerList() {
  const canconer = useSongbookStore((s) => s.canconer)
  const reorder = useSongbookStore((s) => s.reorder)

  // Requereix moure 5px abans d'iniciar drag → els clicks curts no es perden.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Animació FLIP en reordenar (canvi de sortMode, applyAllowedKeys, etc.)
  // Mesura les posicions abans (durant el render previ) i les compara
  // després; aplica un transform invers + transició per "interpolar" entre
  // les dues posicions. Només anima `transform` → 60fps fins i tot amb
  // moltes cançons (el navegador ho fa per GPU sense reflow).
  const listRef = useRef<HTMLUListElement | null>(null)
  const prevRectsRef = useRef<Map<number, DOMRect>>(new Map())
  // Suprimeix el següent pas de FLIP. @dnd-kit ja anima la reordenació
  // durant el drag, així que repetir-la en deixar anar queda lleig.
  const skipNextFlipRef = useRef(false)

  function onDragStart(_e: DragStartEvent) {
    skipNextFlipRef.current = true
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) {
      // Cancel·lat o sense canvi: cap reordenació, no cal saltar FLIP.
      skipNextFlipRef.current = false
      return
    }
    const from = canconer.findIndex((en) => en.song.id === active.id)
    const to = canconer.findIndex((en) => en.song.id === over.id)
    if (from !== -1 && to !== -1) reorder(from, to)
  }

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll<HTMLLIElement>("li[data-song-id]")
    const newRects = new Map<number, DOMRect>()
    items.forEach((el) => {
      const id = Number(el.dataset.songId)
      newRects.set(id, el.getBoundingClientRect())
    })

    const prevRects = prevRectsRef.current
    const shouldSkip = skipNextFlipRef.current
    skipNextFlipRef.current = false

    if (prevRects.size > 0 && !shouldSkip) {
      // Animem amb la Web Animations API (no toquem `style.transform` perquè
      // @dnd-kit també hi escriu — `.animate()` crea una animació separada
      // que el navegador interpola per sobre).
      items.forEach((el) => {
        const id = Number(el.dataset.songId)
        const prev = prevRects.get(id)
        const next = newRects.get(id)
        if (!prev || !next) return
        const dx = prev.left - next.left
        const dy = prev.top - next.top
        if (dx === 0 && dy === 0) return
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 280, easing: "ease", fill: "none" },
        )
      })
    }

    prevRectsRef.current = newRects
  }, [canconer])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={canconer.map((en) => en.song.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul id="canconer-list" ref={listRef}>
          {canconer.map((entry, i) => (
            <SortableItem key={entry.song.id} entry={entry} idx={i} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
