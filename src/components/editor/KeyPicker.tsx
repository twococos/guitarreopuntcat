"use client"
import type { ReactNode } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"

interface KeyPickerProps {
  /** Tonalitat actualment seleccionada (Ex: "Am", "C#") */
  value: string
  /** Callback quan l'usuari tria una nova tonalitat */
  onChange: (key: string) => void
  /** Coordenades viewport on obrir el popover (clientX, clientY) */
  x: number
  y: number
  /** Callback per tancar (click fora, Escape) */
  onClose: () => void
  /** Si està obert. Si false, no es renderitza res. */
  open: boolean
}

// Ordre cromàtic ascendent per majors (començant per C)
const MAJOR_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

// Ordre cromàtic ascendent per menors (començant per Am)
const MINOR_KEYS = ["Am", "A#m", "Bm", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m"] as const

// Organització en graella 3×4
const MAJOR_GRID = [
  [MAJOR_KEYS[0], MAJOR_KEYS[1], MAJOR_KEYS[2], MAJOR_KEYS[3]], // C, C#, D, D#
  [MAJOR_KEYS[4], MAJOR_KEYS[5], MAJOR_KEYS[6], MAJOR_KEYS[7]], // E, F, F#, G
  [MAJOR_KEYS[8], MAJOR_KEYS[9], MAJOR_KEYS[10], MAJOR_KEYS[11]], // G#, A, A#, B
]

const MINOR_GRID = [
  [MINOR_KEYS[0], MINOR_KEYS[1], MINOR_KEYS[2], MINOR_KEYS[3]], // Am, A#m, Bm, Cm
  [MINOR_KEYS[4], MINOR_KEYS[5], MINOR_KEYS[6], MINOR_KEYS[7]], // C#m, Dm, D#m, Em
  [MINOR_KEYS[8], MINOR_KEYS[9], MINOR_KEYS[10], MINOR_KEYS[11]], // Fm, F#m, Gm, G#m
]

export function KeyPicker(props: KeyPickerProps): ReactNode {
  const { value, onChange, x, y, onClose, open } = props
  const t = getT()
  const pickerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [visible, setVisible] = useState(false)

  // Recalculate position after render to ensure viewport-aware placement
  useLayoutEffect(() => {
    if (!open || !pickerRef.current) return
    setVisible(false)
    const pw = pickerRef.current.offsetWidth
    const ph = pickerRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = x + pw > vw ? vw - pw - 8 : x
    const top = y + ph > vh ? vh - ph - 8 : y
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
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("click", onDocClick)
    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("click", onDocClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  function handleKeySelect(key: string) {
    onChange(key)
    onClose()
  }

  return (
    <div
      className="key-picker"
      ref={pickerRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        visibility: visible ? "visible" : "hidden",
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="key-picker-header">{t.editor.keyPicker.tonalitat}</div>

      {/* Major section */}
      <div className="key-picker-section">
        <div className="key-picker-section-label">{t.editor.keyPicker.majors}</div>
        <div className="key-picker-grid">
          {MAJOR_GRID.map((row, rowIdx) =>
            row.map((key) => (
              <button
                key={key}
                className={`key-picker-cell ${value === key ? "selected" : ""}`}
                onClick={() => handleKeySelect(key)}
              >
                {key}
              </button>
            )),
          )}
        </div>
      </div>

      {/* Minor section */}
      <div className="key-picker-section">
        <div className="key-picker-section-label">{t.editor.keyPicker.menors}</div>
        <div className="key-picker-grid">
          {MINOR_GRID.map((row, rowIdx) =>
            row.map((key) => (
              <button
                key={key}
                className={`key-picker-cell ${value === key ? "selected" : ""}`}
                onClick={() => handleKeySelect(key)}
              >
                {key}
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  )
}
