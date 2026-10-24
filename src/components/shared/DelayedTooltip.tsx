"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Explicació que surt en deixar el ratolí a sobre una estona (per defecte
 * 0,5 s), en comptes d'un text fix a sota que ocupa lloc. Va a `document.body`
 * amb `position: fixed`, perquè el panell d'opcions retalla el que en surt.
 * En tàctil no surt: no hi ha hover.
 */
export function DelayedTooltip({
  text,
  delay = 500,
  children,
}: {
  text: string
  delay?: number
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null)

  function clear() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  function show() {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const above = r.bottom + 120 > window.innerHeight
    setPos({ left: r.left, top: above ? r.top - 6 : r.bottom + 6, above })
  }

  useEffect(() => clear, [])

  return (
    <span
      ref={wrapRef}
      className="delayed-tooltip-anchor"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return
        clear()
        timer.current = window.setTimeout(show, delay)
      }}
      onPointerLeave={() => {
        clear()
        setPos(null)
      }}
      onPointerDown={() => {
        clear()
        setPos(null)
      }}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            className={`delayed-tooltip${pos.above ? " is-above" : ""}`}
            style={{ left: pos.left, top: pos.top }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
