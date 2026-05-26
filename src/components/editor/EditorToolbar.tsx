"use client"
import type { ReactNode } from "react"

interface EditorToolbarProps {
  onInsertSection: () => void
  onInsertChord: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Text del botó de guardar (varia segons rol/mode: "Guardar cançó", "Guardar canvis", "Enviar proposta") */
  saveLabel: string
  /** Callback quan l'usuari clica Guardar/Proposar. El pare ha de demanar confirmació via toast. */
  onSave: () => void
  /** Callback quan l'usuari clica Reset/Descartar. El pare ha de demanar confirmació via toast. */
  onReset: () => void
  /** Etiqueta del botó esquerre. Default: "Reset". En mode edit, "Descartar canvis". */
  resetLabel?: string
  /** Si està en disabled state mentre es guarda */
  saving?: boolean
  /**
   * Si està set, tots els botons (excepte Reset) es mostren desactivats.
   * S'usa mentre no s'ha seleccionat la tonalitat de la cançó.
   */
  disabledReason?: string
  /**
   * Mode de la toolbar: "normal" (per defecte) o "review" (revisió de propostes).
   * En mode review, els botons Reset/Guardar se substitueixen per Acceptar/Rebutjar.
   */
  mode?: "normal" | "review"
  /** Callback Acceptar (només mode review). */
  onAccept?: () => void
  /** Callback Rebutjar (només mode review). */
  onReject?: () => void
}

export function EditorToolbar({
  onInsertSection,
  onInsertChord,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saveLabel,
  onSave,
  onReset,
  resetLabel = "Reset",
  saving = false,
  disabledReason,
  mode = "normal",
  onAccept,
  onReject,
}: EditorToolbarProps): ReactNode {
  const blocked = !!disabledReason
  const isReview = mode === "review"
  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar-group">
        <button
          type="button"
          className="toolbar-btn"
          title="Inserir títol de secció (o clic mig sobre la lletra)"
          onClick={onInsertSection}
          disabled={blocked}
        >
          § Secció
        </button>
        <button
          type="button"
          className="toolbar-btn"
          title="Inserir acord (o clic dret sobre la lletra)"
          onClick={onInsertChord}
          disabled={blocked}
        >
          ♩ Acord
        </button>
        <span className="editor-toolbar-sep" />
        <button
          type="button"
          className="toolbar-btn"
          title="Desfer (Ctrl+Z)"
          onClick={onUndo}
          disabled={blocked || !canUndo}
        >
          ↩ Desfer
        </button>
        <button
          type="button"
          className="toolbar-btn"
          title="Refer (Ctrl+Y)"
          onClick={onRedo}
          disabled={blocked || !canRedo}
        >
          ↪ Refer
        </button>
        <span className="editor-toolbar-sep" />
        <span className="editor-toolbar-hint" title="Drecera ratolí">
          clic mig → secció · clic dret → acord
        </span>
      </div>

      <span className="editor-toolbar-spacer" />

      <div className="editor-toolbar-group">
        {isReview ? (
          <>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-reject"
              title="Rebutjar la proposta"
              onClick={onReject}
              disabled={saving}
            >
              ✕ Rebutjar
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-approve"
              title="Acceptar la proposta i guardar la cançó"
              onClick={onAccept}
              disabled={blocked || saving}
            >
              ✓ Acceptar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="toolbar-btn"
              title={resetLabel === "Reset" ? "Restablir tot el contingut" : resetLabel}
              onClick={onReset}
              disabled={saving}
            >
              ⟳ {resetLabel}
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-primary"
              title={saveLabel}
              onClick={onSave}
              disabled={blocked || saving}
            >
              💾 {saveLabel}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
