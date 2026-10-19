"use client"
import { useEffect, type ReactNode } from "react"

/**
 * Carcassa de diàleg modal per al panell d'admin: es tanca amb Esc o clicant
 * fora de la caixa (com LoginPopup).
 */
export function AdminDialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="admin-dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="admin-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="admin-dialog-title">{title}</h2>
        {description && <p className="admin-dialog-desc">{description}</p>}
        <div className="admin-dialog-body">{children}</div>
        {footer && <div className="admin-dialog-footer">{footer}</div>}
      </div>
    </div>
  )
}
