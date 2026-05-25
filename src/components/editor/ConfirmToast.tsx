"use client"
import { useEffect } from "react"
import type { ReactNode } from "react"

interface ConfirmToastProps {
  open: boolean
  /** Text principal (pot ser una pregunta). Es renderitza com a paràgraf. */
  message: string
  /** Text del botó de confirmar. Per defecte: "Sí" */
  confirmLabel?: string
  /** Text del botó de cancel·lar. Per defecte: "Cancel·lar" */
  cancelLabel?: string
  /** Variant del botó de confirmar: "primary" (verd/accent) o "danger" (vermell, per a destructives) */
  confirmVariant?: "primary" | "danger"
  /** Callback en clicar Sí */
  onConfirm: () => void
  /** Callback en clicar No o quan auto-tanca per timeout */
  onCancel: () => void
  /** Auto-dismiss en N ms; si no especificat, no es tanca sol */
  autoDismissMs?: number
}

export function ConfirmToast({
  open,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = "primary",
  onConfirm,
  onCancel,
  autoDismissMs,
}: ConfirmToastProps): ReactNode {
  useEffect(() => {
    if (!open || autoDismissMs === undefined) return
    const timer = setTimeout(() => onCancel(), autoDismissMs)
    return () => clearTimeout(timer)
  }, [open, autoDismissMs, onCancel])

  if (!open) return null

  return (
    <div className="confirm-toast">
      <p className="confirm-toast-message">{message}</p>
      <div className="confirm-toast-actions">
        <button
          type="button"
          className={`confirm-toast-yes btn-${confirmVariant === "danger" ? "danger" : "primary"} btn-sm`}
          onClick={onConfirm}
        >
          {confirmLabel ?? "Sí"}
        </button>
        <button
          type="button"
          className="confirm-toast-no btn-ghost btn-sm"
          onClick={onCancel}
        >
          {cancelLabel ?? "Cancel·lar"}
        </button>
      </div>
    </div>
  )
}
