"use client"

interface ToolbarProps {
  onInsertSection: () => void
  onInsertChord: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  previewOn: boolean
  onTogglePreview: (on: boolean) => void
}

export function EditorToolbar({
  onInsertSection,
  onInsertChord,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  previewOn,
  onTogglePreview,
}: ToolbarProps) {
  return (
    <div id="editor-toolbar">
      <button title="Inserir títol de secció" onClick={onInsertSection}>
        § Secció
      </button>
      <button title="Inserir acord buit" onClick={onInsertChord}>
        ♩ Acord
      </button>
      <span className="toolbar-sep" />
      <button title="Desfer (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        ↩ Desfer
      </button>
      <button title="Refer (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
        ↪ Refer
      </button>
      <span className="toolbar-sep" />
      <label className="toolbar-toggle">
        <input
          type="checkbox"
          checked={previewOn}
          onChange={(e) => onTogglePreview(e.target.checked)}
        />
        Vista prèvia
      </label>
    </div>
  )
}
