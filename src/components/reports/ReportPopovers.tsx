"use client"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { getT } from "@/lib/i18n"
import { applyModifier, chordsByFunction } from "@/lib/editor/chordFunctions"
import { SECTION_TYPES } from "@/lib/editor/sections"
import { respellAccidentals, type AccidentalMap } from "@/lib/transpose"
import { IconX } from "@/components/shared/Icons"

/**
 * Popover del report: s'obre al costat d'on s'ha tocat (escriptori) o com a
 * full inferior (mòbil, via CSS). Es tanca amb Esc o tocant fora.
 */
export function ReportPopover({
  x,
  y,
  title,
  onClose,
  children,
}: {
  x: number
  y: number
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y, visible: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    // A sota del punt si hi cap; si no, a sobre
    const top = y + 12 + h > window.innerHeight - 8 ? Math.max(8, y - h - 12) : y + 12
    setPos({ left, top, visible: true })
  }, [x, y])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    function onDown(e: PointerEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onClose()
    }
    // Al següent tick: el mateix toc que l'ha obert no l'ha de tancar
    const id = window.setTimeout(() => document.addEventListener("pointerdown", onDown), 0)
    document.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="rp-popover"
      role="dialog"
      aria-label={title}
      style={{ left: pos.left, top: pos.top, visibility: pos.visible ? "visible" : "hidden" }}
    >
      <div className="rp-popover-head">
        <span className="rp-popover-title">{title}</span>
        <button type="button" className="rp-icon-btn" onClick={onClose} aria-label={getT().public.report.tanca}>
          <IconX />
        </button>
      </div>
      {children}
    </div>,
    document.body,
  )
}

const VARIANTS = ["7", "maj7", "m7", "sus2", "sus4", "add9", "6", "dim", "9", "aug"] as const
const CHORD_RE = /^[A-G][#b]?[^\s<>/]{0,10}(\/[A-G][#b]?)?$/

/**
 * Selector d'acords: els del to que es veu, una variant opcional, els altres i
 * un camp lliure. Un toc a un acord ja el tria (amb la variant marcada).
 * Retorna l'acord en la notació en sostinguts del to que es veu.
 */
export function ChordPicker({
  displayKey,
  notation,
  current,
  occurrences,
  onPick,
}: {
  /** To que es veu, en sostinguts (transposat). */
  displayKey: string
  notation: AccidentalMap
  /** Acord que es vol canviar (ja com es veu), si n'hi ha. */
  current?: string
  /** Quantes vegades surt `current` a la cançó: si n'hi ha més d'una, es pot canviar a tot arreu. */
  occurrences?: number
  onPick: (chord: string, all: boolean) => void
}) {
  const t = getT().public.report.picker
  const [variant, setVariant] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [free, setFree] = useState("")
  const [freeError, setFreeError] = useState(false)

  const f = chordsByFunction(displayKey)
  const inKey = [f.tonic[0], f.subdominant[0], f.dominant[0], f.tonic[1], f.subdominant[1], f.dominant[1], f.dominant[2]].filter(
    (c): c is string => Boolean(c),
  )
  const show = (c: string) => respellAccidentals(c, notation)

  function pick(chord: string) {
    onPick(variant ? applyModifier(chord, variant) : chord, all)
  }

  function pickFree() {
    const c = free.trim()
    if (!CHORD_RE.test(c)) {
      setFreeError(true)
      return
    }
    onPick(c, all)
  }

  return (
    <div className="rp-chord-picker">
      <div className="rp-label">{t.delTo}</div>
      <div className="rp-chord-grid rp-chord-grid-main">
        {inKey.map((c) => (
          <button key={c} type="button" className={`rp-chord-btn${c === current ? " is-current" : ""}`} onClick={() => pick(c)}>
            {show(variant ? applyModifier(c, variant) : c)}
          </button>
        ))}
      </div>

      <div className="rp-label">{t.variant}</div>
      <div className="rp-variant-row">
        {VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            className={`rp-variant${variant === v ? " is-active" : ""}`}
            aria-pressed={variant === v}
            onClick={() => setVariant(variant === v ? null : v)}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="rp-label">{t.altres}</div>
      <div className="rp-chord-grid">
        {f.chromatic.map((c) => (
          <button key={c} type="button" className="rp-chord-btn rp-chord-btn-small" onClick={() => pick(c)}>
            {show(variant ? applyModifier(c, variant) : c)}
          </button>
        ))}
      </div>

      <form
        className="rp-free-row"
        onSubmit={(e) => {
          e.preventDefault()
          pickFree()
        }}
      >
        <label>
          <span className="rp-label">{t.escriu}</span>
          <input
            value={free}
            onChange={(e) => {
              setFree(e.target.value)
              setFreeError(false)
            }}
            placeholder={t.escriuPlaceholder}
            maxLength={16}
            autoCapitalize="characters"
            aria-invalid={freeError}
          />
        </label>
        <button type="submit" className="rp-btn rp-btn-small" disabled={!free.trim()}>
          {t.ok}
        </button>
      </form>
      {freeError && <p className="rp-error">{t.noValid}</p>}

      {current && (occurrences ?? 0) > 1 && (
        <label className="rp-check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {t.totes(show(current))}
        </label>
      )}
    </div>
  )
}

/** Llista de tipus de secció. */
export function SectionPicker({ current, onPick }: { current?: string; onPick: (name: string) => void }) {
  return (
    <div className="rp-section-grid">
      {SECTION_TYPES.map((s) => (
        <button key={s} type="button" className={`rp-chip-btn${s === current ? " is-current" : ""}`} onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  )
}

/** Camp de text amb botó d'afegir. Enter envia (Ctrl+Enter si és multilínia). */
export function TextPicker({
  initial = "",
  multiline = false,
  placeholder,
  allowEmpty = false,
  submitLabel,
  onSubmit,
}: {
  initial?: string
  multiline?: boolean
  placeholder?: string
  allowEmpty?: boolean
  submitLabel: string
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const disabled = !allowEmpty && !text.trim()
  const submit = () => {
    if (!disabled) onSubmit(text)
  }

  return (
    <form
      className="rp-text-picker"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {multiline ? (
        <textarea
          ref={ref}
          value={text}
          rows={4}
          maxLength={2000}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
        />
      ) : (
        <input ref={ref} value={text} maxLength={2000} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      )}
      <button type="submit" className="rp-btn" disabled={disabled}>
        {submitLabel}
      </button>
    </form>
  )
}
