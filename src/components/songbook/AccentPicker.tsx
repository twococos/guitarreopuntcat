"use client"
import { useEffect, useRef, useState } from "react"
import { ACCENT_COLOR_PALETTE } from "@/lib/schemas/canconer"
import { getT } from "@/lib/i18n"

/**
 * Popover de selecció de color d'accent.
 * Mostres predefinides (paleta) + input hex + botó "Per defecte".
 *
 * `value` és el color actualment seleccionat (null = usa el default del preset).
 * `onChange` rep el nou valor (string hex, o null per "Per defecte").
 */
interface Props {
  value: string | null
  onChange: (color: string | null) => void
  onClose: () => void
}

function isValidHex(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)
}

export function AccentPicker({ value, onChange, onClose }: Props) {
  const t = getT()
  const ref = useRef<HTMLDivElement>(null)
  const [hexInput, setHexInput] = useState(value ?? "")

  // Tancar quan es fa clic fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  function handleHexSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = hexInput.trim()
    if (isValidHex(trimmed)) {
      onChange(trimmed.toLowerCase())
    }
  }

  return (
    <div ref={ref} className="accent-picker">
      <div className="accent-picker-swatches">
        {ACCENT_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            className={`accent-swatch-option${value === c ? " active" : ""}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
            type="button"
          />
        ))}
      </div>
      <form className="accent-picker-hex" onSubmit={handleHexSubmit}>
        <input
          type="text"
          placeholder={t.app.songbook.accentPicker.hexPlaceholder}
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          maxLength={7}
        />
        <button
          type="submit"
          disabled={!isValidHex(hexInput.trim())}
          className="btn-sm"
        >
          OK
        </button>
      </form>
      <button
        type="button"
        className="accent-picker-default"
        onClick={() => {
          onChange(null)
          setHexInput("")
        }}
      >
        {t.app.songbook.accentPicker.perDefecte}
      </button>
    </div>
  )
}
