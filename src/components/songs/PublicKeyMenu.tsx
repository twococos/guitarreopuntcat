"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CHROMATIC } from "@/lib/transpose"
import { getT } from "@/lib/i18n"

interface Props {
  /** Posició ancla en coordenades de viewport (clientX/Y). */
  x: number
  y: number
  /** Tonalitat original de la cançó (per saber si és major o menor i no canviar de mode). */
  originalKey: string
  /** Tonalitat actualment mostrada (per marcar la cel·la com a "current"). */
  currentKey: string
  open: boolean
  onClose: () => void
  /** Rep la nova tonalitat ja amb sufix `m` si correspon. */
  onSelect: (key: string) => void
}

/**
 * PublicKeyMenu — versió desacoblada del store de KeyMenu.tsx (cançoner).
 *
 * Només mostra les 12 tonalitats del MATEIX mode que l'original (majors o
 * menors). Transposar mai canvia el mode, per això és el comportament
 * correcte.
 */
export function PublicKeyMenu({
  x,
  y,
  originalKey,
  currentKey,
  open,
  onClose,
  onSelect,
}: Props) {
  const t = getT()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    setVisible(false)
    const w = menuRef.current.offsetWidth
    const h = menuRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    if (left + w > vw) left = vw - w - 8
    if (left < 8) left = 8
    let top = y
    if (top + h > vh) top = y - h - 12
    if (top < 8) top = 8
    setPos({ left, top })
    setVisible(true)
  }, [open, x, y])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDocClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDocClick)
    }
  }, [open, onClose])

  if (!open) return null

  const isMinor = originalKey.endsWith("m") && originalKey !== "F" && originalKey !== "C"
  const keysForSong = (CHROMATIC as readonly string[]).map((note) =>
    isMinor ? note + "m" : note,
  )

  return (
    <div
      id="key-menu"
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 1000,
        visibility: visible ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="key-menu-title">{t.public.publicSong.controls.canviarTonalitat}</div>
      <div className="key-menu-grid">
        {keysForSong.map((k) => (
          <button
            key={k}
            type="button"
            className={k === currentKey ? "current" : ""}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(k)
              onClose()
            }}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
