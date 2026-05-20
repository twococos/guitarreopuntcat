"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { chordsForKey } from "@/lib/transpose"

interface MenuProps {
  open: boolean
  x: number
  y: number
  chordKey: string
  onInsertSection: () => void
  onInsertChord: (chord: string) => void
  onClose: () => void
}

export function ChordContextMenu({
  open,
  x,
  y,
  chordKey,
  onInsertSection,
  onInsertChord,
  onClose,
}: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [visible, setVisible] = useState(false)

  // Recalculate position after render to ensure viewport-aware placement
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

  // Close on document click or Escape
  useEffect(() => {
    if (!open) return
    function onDocClick() {
      onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("click", onDocClick)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("click", onDocClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const { diatonic, secondary } = chordsForKey(chordKey)

  function handleSectionMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    onInsertSection()
    onClose()
  }

  function handleChordMouseDown(e: React.MouseEvent, chord: string) {
    e.preventDefault()
    onInsertChord(chord)
    onClose()
  }

  return (
    <div
      id="chord-menu"
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        visibility: visible ? "visible" : "hidden",
      }}
      // Prevent click from bubbling to document (which would close the menu immediately)
      onClick={(e) => e.stopPropagation()}
    >
      <div id="chord-menu-header">Inserir</div>
      <div id="chord-menu-groups">
        <button className="chord-menu-action" onMouseDown={handleSectionMouseDown}>
          § Inserir secció
        </button>
        <hr className="chord-menu-sep" />
        {diatonic.length > 0 && (
          <>
            <div className="chord-group-label">Acords diatònics</div>
            <div className="chord-group-items">
              {diatonic.map((chord) => (
                <button key={chord} onMouseDown={(e) => handleChordMouseDown(e, chord)}>
                  {chord}
                </button>
              ))}
            </div>
          </>
        )}
        {secondary.length > 0 && (
          <>
            <div className="chord-group-label">Variacions</div>
            <div className="chord-group-items">
              {secondary.map((chord) => (
                <button key={chord} onMouseDown={(e) => handleChordMouseDown(e, chord)}>
                  {chord}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
