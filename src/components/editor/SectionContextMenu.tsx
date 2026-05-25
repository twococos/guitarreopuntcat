"use client"

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { SECTION_TYPES, getSectionType, nextSectionName } from "@/lib/editor/sections"
import type { SectionType } from "@/lib/editor/sections"

interface SectionMenuProps {
  open: boolean
  x: number
  y: number
  mode: "insert" | "modify"
  existingSectionNames: string[]
  currentName?: string
  onInsert: (name: string) => void
  onModify: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}

export function SectionContextMenu({
  open,
  x,
  y,
  mode,
  existingSectionNames,
  currentName,
  onInsert,
  onModify,
  onDelete,
  onClose,
}: SectionMenuProps): ReactNode {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [visible, setVisible] = useState(false)

  // Tipus actual de la secció (per marcar-la com "active" en mode modify).
  const currentType: SectionType | null = currentName ? getSectionType(currentName) : null

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    setVisible(false)
    const mw = menuRef.current.offsetWidth
    const mh = menuRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = x + mw > vw ? vw - mw - 8 : x
    const top = y + mh > vh ? vh - mh - 8 : y
    setPos({ left, top })
    setVisible(true)
  }, [open, x, y])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const m = menuRef.current
      if (m && e.target instanceof Node && m.contains(e.target)) return
      onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    // Diferim el registre perquè el click que obre el menú no el tanqui.
    const id = window.setTimeout(() => {
      document.addEventListener("click", onDocClick)
    }, 0)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("click", onDocClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  // Clic sobre un tipus: en mode insert, afegeix nova secció; en mode modify,
  // canvia el tipus de la secció existent.
  function handleTypeMouseDown(e: React.MouseEvent, type: SectionType) {
    e.preventDefault()
    if (mode === "modify") {
      // Filtrem el nom actual de la llista per no comptar-lo doblement (Estrofa).
      const filtered = existingSectionNames.filter((n) => n !== currentName)
      const newName = nextSectionName(filtered, type)
      onModify(newName)
    } else {
      const name = nextSectionName(existingSectionNames, type)
      onInsert(name)
    }
    onClose()
  }

  function handleDeleteMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    onDelete()
    onClose()
  }

  const modeClass =
    mode === "insert" ? "chord-menu-mode-insert" : "chord-menu-mode-modify"

  return (
    <div
      className={`section-menu ${modeClass}`}
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        visibility: visible ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {mode === "modify" && (
        <>
          <button
            className="section-menu-delete-btn"
            onMouseDown={handleDeleteMouseDown}
          >
            Eliminar secció
          </button>
          <hr className="chord-menu-sep" />
        </>
      )}

      <div className="chord-menu-header">
        {mode === "insert" ? "Afegir secció" : "Canviar tipus"}
      </div>
      <div className="chord-menu-groups">
        {SECTION_TYPES.map((type) => {
          const isActive = mode === "modify" && currentType === type
          return (
            <button
              key={type}
              className={`section-menu-item${isActive ? " active" : ""}`}
              onMouseDown={(e) => handleTypeMouseDown(e, type)}
            >
              {type}
            </button>
          )
        })}
      </div>
    </div>
  )
}
