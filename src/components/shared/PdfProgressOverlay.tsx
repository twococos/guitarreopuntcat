"use client"
import type { ReactNode } from "react"

interface Props {
  /** Si l'overlay s'ha de mostrar. */
  open: boolean
  /** Percentatge actual (0..100). */
  pct: number
  /** Títol gran de l'overlay. */
  title: string
  /** Missatge de conya actual (va rotant). */
  message: string
}

/**
 * Overlay gran centrat amb una barra de progrés ben visible mentre es
 * genera el PDF d'un cançoner. El progrés és simulat (vegeu usePdfProgress);
 * aquest component és purament presentacional i controlat.
 */
export function PdfProgressOverlay({ open, pct, title, message }: Props): ReactNode {
  if (!open) return null

  const rounded = Math.round(pct)
  return (
    <div className="pdf-progress-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pdf-progress-card">
        <h2 className="pdf-progress-title">{title}</h2>
        <div className="pdf-progress-bar" aria-hidden="true">
          <div className="pdf-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="pdf-progress-row">
          <span className="pdf-progress-message">{message}…</span>
          <span className="pdf-progress-pct">{rounded}%</span>
        </div>
      </div>
    </div>
  )
}
