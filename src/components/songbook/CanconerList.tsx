"use client"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useSongbookStore, type CanconerEntry } from "@/hooks/useSongbook"
import { transposeKey } from "@/lib/transpose"

function SortableItem({ entry, idx }: { entry: CanconerEntry; idx: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.song.id,
  })
  const selected = useSongbookStore((s) => s.selectedIdx === idx)
  const setSelected = useSongbookStore((s) => s.setSelectedIdx)
  const bump = useSongbookStore((s) => s.bumpSemitones)
  const remove = useSongbookStore((s) => s.removeFromCanconer)
  const openKeyMenu = useSongbookStore((s) => s.openKeyMenu)

  const currentKey = transposeKey(entry.song.key, entry.semitones)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <li
      ref={setNodeRef}
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
          title="−1 semitò"
          onClick={(e) => {
            e.stopPropagation()
            bump(idx, -1)
          }}
        >
          −
        </button>
        <span
          className="c-key"
          title="Canviar tonalitat"
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
          title="+1 semitò"
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
        title="Treure"
        onClick={(e) => {
          e.stopPropagation()
          remove(idx)
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ✕
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

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = canconer.findIndex((en) => en.song.id === active.id)
    const to = canconer.findIndex((en) => en.song.id === over.id)
    if (from !== -1 && to !== -1) reorder(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={canconer.map((en) => en.song.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul id="canconer-list">
          {canconer.map((entry, i) => (
            <SortableItem key={entry.song.id} entry={entry} idx={i} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
