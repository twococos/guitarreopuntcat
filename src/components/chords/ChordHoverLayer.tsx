"use client"
import { useEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { chordDiagramHtml, DIAGRAM_W } from "@/lib/chords/diagram"
import { getT } from "@/lib/i18n"

/** Temps de hover sobre un acord abans de mostrar-ne el diagrama. */
const HOVER_DELAY_MS = 500
/** Amplada del diagrama al popover (px CSS); ha de coincidir amb --chord-w de globals.css. */
const POPOVER_W = 88

/**
 * Gruix de cordes i trasts (en unitats del viewBox) perquè facin exactament
 * 1 píxel físic (2 a les pantalles d'alta densitat) amb qualsevol zoom: amb
 * `crispEdges`, així totes les línies surten del mateix gruix.
 */
function crispLine(): number {
  const dpr = window.devicePixelRatio || 1
  const px = Math.max(1, Math.round(dpr * 0.8))
  return (px * DIAGRAM_W) / (POPOVER_W * dpr)
}

/** Alçada aproximada del popover, per decidir si cap a sobre de l'acord. */
const POPOVER_H = 150
/** Alçada de la nav enganxosa de les pàgines públiques. */
const TOP_RESERVED = 72

interface Open {
  el: HTMLElement
  html: string
  name: string
  pinned: boolean
}

/** Caixa del text de l'acord: el `ch` fa 0×0 (song.css) i el text en sobresurt. */
function chordRect(el: HTMLElement): DOMRect {
  const r = document.createRange()
  r.selectNodeContents(el)
  const rect = r.getBoundingClientRect()
  return rect.width > 0 ? rect : el.getBoundingClientRect()
}

/**
 * Diagrama de guitarra dels acords del cos d'una cançó (§23). Escolta per
 * delegació els `ch` de `.song-body` dins `containerRef`, així serveix igual
 * per al cos estàtic que per al del reproductor (`SyncedSongBody`):
 *  - ratolí a sobre 0,5 s → surt; en sortir-ne, s'amaga;
 *  - clic (o toc) → queda fixat fins a un clic fora o Esc.
 * No fa res amb `disabled` (mode report: allà els acords s'arrosseguen).
 */
export function ChordHoverLayer({
  containerRef,
  disabled = false,
}: {
  containerRef: RefObject<HTMLElement | null>
  disabled?: boolean
}) {
  const [open, setOpen] = useState<Open | null>(null)
  const [, setTick] = useState(0)
  const openRef = useRef<Open | null>(null)
  openRef.current = open
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root || disabled) {
      setOpen(null)
      return
    }
    let timer: number | null = null
    const clear = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const chordAt = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      const ch = target.closest("ch")
      return ch instanceof HTMLElement && ch.closest(".song-body") && root.contains(ch) ? ch : null
    }
    const make = (el: HTMLElement, pinned: boolean): Open | null => {
      const name = (el.textContent ?? "").trim()
      const html = name ? chordDiagramHtml(name, name, crispLine()) : null
      return html ? { el, html, name, pinned } : null
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const ch = chordAt(e.target)
      if (!ch || openRef.current?.pinned) return
      clear()
      timer = window.setTimeout(() => setOpen(make(ch, false)), HOVER_DELAY_MS)
    }
    const onOut = (e: PointerEvent) => {
      const ch = chordAt(e.target)
      if (!ch || (e.relatedTarget instanceof Node && ch.contains(e.relatedTarget))) return
      clear()
      if (!openRef.current?.pinned) setOpen(null)
    }
    const onClick = (e: MouseEvent) => {
      const ch = chordAt(e.target)
      if (!ch) return
      clear()
      const cur = openRef.current
      setOpen(cur?.pinned && cur.el === ch ? null : make(ch, true))
    }
    // Clic fora (ni a un acord ni al popover) o Esc: tanca el fixat.
    const onDocDown = (e: PointerEvent) => {
      if (!openRef.current) return
      if (chordAt(e.target)) return
      if (e.target instanceof Node && popRef.current?.contains(e.target)) return
      setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
    }
    // En fer scroll o canviar la mida, es recol·loca (o es tanca si l'acord ja no hi és).
    const onMove = () => {
      const cur = openRef.current
      if (!cur) return
      if (!cur.el.isConnected) setOpen(null)
      else setTick((t) => t + 1)
    }

    root.addEventListener("pointerover", onOver)
    root.addEventListener("pointerout", onOut)
    root.addEventListener("click", onClick)
    document.addEventListener("pointerdown", onDocDown, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      clear()
      root.removeEventListener("pointerover", onOver)
      root.removeEventListener("pointerout", onOut)
      root.removeEventListener("click", onClick)
      document.removeEventListener("pointerdown", onDocDown, true)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [containerRef, disabled])

  if (!open || typeof document === "undefined") return null
  const r = chordRect(open.el)
  const below = r.top - POPOVER_H < TOP_RESERVED
  const style = {
    left: Math.min(Math.max(r.left + r.width / 2, 70), window.innerWidth - 70),
    top: below ? r.bottom + 8 : r.top - 8,
  }
  return createPortal(
    <div
      ref={popRef}
      className={`chord-popover${below ? " is-below" : ""}${open.pinned ? " is-pinned" : ""}`}
      style={style}
      role="tooltip"
      aria-label={getT().public.publicSong.diagramaAcord(open.name)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: open.html }}
    />,
    document.body,
  )
}
