"use client"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { IconChevronDown } from "@/components/shared/Icons"

export interface BadgeMenuOption {
  value: string
  label: ReactNode
  /** Classe de l'etiqueta de l'opció (p. ex. "badge badge-kind-public"). */
  badgeClass?: string
  hint?: string
  disabled?: boolean
}

/**
 * Etiqueta clicable del panell d'admin: en clicar-la obre un desplegable amb
 * les opcions (tipus de cançó, visibilitat del cançoner, rol d'usuari). El
 * menú va en un portal amb posició fixa perquè les taules tenen
 * `overflow: hidden`. Es tanca amb Esc, clicant fora o fent scroll.
 */
export function BadgeMenu({
  label,
  badgeClass,
  options,
  current,
  onSelect,
  title,
  disabled = false,
}: {
  label: ReactNode
  badgeClass: string
  options: BadgeMenuOption[]
  current?: string
  onSelect: (value: string) => void
  title?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const menuH = menuRef.current?.offsetHeight ?? 0
    const below = r.bottom + 4
    // Si no hi cap per sota, s'obre per sobre
    const top = below + menuH > window.innerHeight - 8 ? Math.max(8, r.top - 4 - menuH) : below
    setPos({ top, left: Math.min(r.left, window.innerWidth - 240) })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    function onScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  if (disabled) return <span className={badgeClass}>{label}</span>

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${badgeClass} badge-menu-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
      >
        {label}
        <IconChevronDown className="badge-menu-caret" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="badge-menu"
            role="menu"
            style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                className={`badge-menu-option ${o.value === current ? "is-current" : ""}`}
                disabled={o.disabled || o.value === current}
                onClick={() => {
                  setOpen(false)
                  onSelect(o.value)
                }}
              >
                {o.badgeClass ? <span className={o.badgeClass}>{o.label}</span> : <span>{o.label}</span>}
                {o.hint && <small>{o.hint}</small>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
