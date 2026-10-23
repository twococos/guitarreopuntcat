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
import { COVER_CATEGORY_ID } from "./options/OptionsPanel"
import type { SongKind } from "@/lib/songKind"

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
  const openArrange = useSongbookStore((s) => s.openArrange)
  const notation = useSongbookStore((s) => s.pdfOptions.notation)

  const currentKey = respellAccidentals(transposeKey(entry.song.key, entry.semitones), notation)
  // L'API (mapSong) hi afegeix `kind`, que el tipus `Song` de la BD no porta.
  const kind = (entry.song as unknown as { kind?: SongKind }).kind
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
        if ((e.target as HTMLElement).closest(".c-transpose, .c-remove, .c-arrange")) return
        setSelected(idx)
      }}
      {...attributes}
      {...listeners}
    >
      <span className="c-num">{idx + 1}</span>
      <span className="c-title">
        <span className="c-title-text">{entry.song.title}</span>
        {kind && kind !== "public" && (
          <span className={`song-kind-tag song-kind-${kind}`}>{t.app.songbook.songList.tipus[kind]}</span>
        )}
        {entry.arrangement && (
          <span className="song-kind-tag song-kind-arrangement">{t.app.songbook.songList.tipus.arrangement}</span>
        )}
      </span>
      <span className="c-artist">{entry.song.artist}</span>
      <div className="c-transpose" onPointerDown={(e) => e.stopPropagation()}>
        <ArrangeButton entry={entry} onOpen={() => openArrange(idx)} className="c-arrange" />
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

/**
 * Botó «Arranjar» (arranjament ràpid, §22): només a les cançons publicades; si l'entrada ja té
 * arranjament, «Edita l'arranjament». Surt en passar el cursor per la fila (o amb la fila
 * seleccionada), flotant a l'esquerra de la tonalitat: no ocupa columna, així totes les files
 * mantenen la mateixa graella. Que la cançó està arranjada ho diu l'etiqueta del títol.
 */
export function ArrangeButton({
  entry,
  onOpen,
  className,
}: {
  entry: CanconerEntry
  onOpen: () => void
  className: string
}) {
  const t = getT()
  const tq = t.app.songbook.quickArrange
  if (entry.song.state !== 0) return null
  const active = Boolean(entry.arrangement)
  return (
    <button
      type="button"
      className={`${className}${active ? " is-active" : ""}`}
      title={active ? tq.botoActiuTitle : tq.botoTitle}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {active ? tq.botoEdita : tq.boto}
    </button>
  )
}

/** Interruptor petit dins un ítem de la llista (no selecciona l'ítem). */
function MiniSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`opt-switch is-mini${checked ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
    >
      <span className="opt-switch-knob" aria-hidden="true" />
    </button>
  )
}

/** Primer ítem de la llista: portada + índex, cadascun amb el seu
 *  interruptor. Clicar-lo porta la prèvia a l'inici; «Edita» (on hi hauria
 *  la tonalitat) obre les opcions de portada. */
function FrontItem() {
  const t = getT()
  const l = t.app.songbook.canconerList
  const showCover = useSongbookStore((s) => s.pdfOptions.show_cover)
  const showIndex = useSongbookStore((s) => s.pdfOptions.show_index)
  const setOpt = useSongbookStore((s) => s.setPdfOption)
  const selected = useSongbookStore((s) => s.selectedIdx === null)
  const selectFront = useSongbookStore((s) => s.selectFront)
  const requestPreviewScroll = useSongbookStore((s) => s.requestPreviewScroll)
  const openOptionsAt = useSongbookStore((s) => s.openOptionsAt)

  /** Clic a «Índex»: selecciona l'ítem però porta la prèvia a l'índex. */
  function goToIndex() {
    selectFront()
    requestPreviewScroll({ kind: "toc" })
  }

  return (
    <li
      className={`c-front${selected ? " selected" : ""}${showCover ? "" : " is-cover-off"}`}
      onClick={selectFront}
    >
      <span className="c-num" />
      <span className={`c-front-part${showCover ? "" : " is-off"}`}>
        <span className="c-title">{l.portada}</span>
        <MiniSwitch
          checked={showCover}
          onChange={(v) => {
            setOpt("show_cover", v)
            if (v) requestPreviewScroll({ kind: "front" })
          }}
          label={l.mostrarPortada}
        />
      </span>
      <span
        className={`c-front-part${showIndex ? "" : " is-off"}`}
        onClick={(e) => {
          e.stopPropagation()
          goToIndex()
        }}
      >
        <span className="c-artist">{l.index}</span>
        <MiniSwitch
          checked={showIndex}
          onChange={(v) => {
            setOpt("show_index", v)
            if (v) requestPreviewScroll({ kind: "toc" })
          }}
          label={l.mostrarIndex}
        />
      </span>
      <button
        type="button"
        className="c-edit"
        title={l.editaPortadaTitle}
        onClick={(e) => {
          e.stopPropagation()
          openOptionsAt(COVER_CATEGORY_ID)
        }}
      >
        {l.edita}
      </button>
      {/* Mateixa amplada que la creu de treure de les cançons: cada fila és
          una graella pròpia i, sense, «Índex» no quedaria alineat. */}
      <span className="c-remove c-remove-slot" aria-hidden="true">
        <IconX />
      </span>
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
          <FrontItem />
          {canconer.map((entry, i) => (
            <SortableItem key={entry.song.id} entry={entry} idx={i} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
