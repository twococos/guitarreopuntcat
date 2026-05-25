"use client"
import {
  type ChangeEvent,
  type ReactNode,
  useRef,
  useState,
} from "react"
import { KeyPicker } from "./KeyPicker"

// Tipus oficial de metadades de la cançó.
export interface SongMetadata {
  title: string
  artist: string
  key: string
  capo: number
  language: string
  tags: string
}

interface SongHeaderProps {
  value: SongMetadata
  onChange: (next: SongMetadata) => void
}

// Quin camp de text és en mode edició: "title", "artist" o cap (null).
type EditingField = "title" | "artist" | null

// Posició del popover del KeyPicker
interface KeyPickerPos {
  x: number
  y: number
}

export function SongHeader({ value, onChange }: SongHeaderProps): ReactNode {
  // Camp de text en edició inline
  const [editing, setEditing] = useState<EditingField>(null)
  // Valor temporal mentre s'edita (per poder cancel·lar amb Escape)
  const [draft, setDraft] = useState<string>("")

  // Estat del KeyPicker
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyPos, setKeyPos] = useState<KeyPickerPos>({ x: 0, y: 0 })

  // Ref per fer .select() en entrar al mode d'edició
  const titleInputRef = useRef<HTMLInputElement>(null)
  const artistInputRef = useRef<HTMLInputElement>(null)

  // ── Edició de títol i artista ───────────────────────────

  function startEditing(field: EditingField) {
    if (field === null) return
    setEditing(field)
    setDraft(value[field])
    // autoFocus + select es fa via l'atribut autoFocus i l'onFocus del input
  }

  function commitEdit() {
    if (editing === null) return
    onChange({ ...value, [editing]: draft })
    setEditing(null)
  }

  function cancelEdit() {
    setEditing(null)
    // No cridem onChange: descartem el draft
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
    }
  }

  function handleArtistKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
    }
  }

  // Selecciona tot el text quan el input rep el focus
  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.select()
  }

  // ── Badge de tonalitat ──────────────────────────────────

  function handleOpenKeyPicker(e: React.MouseEvent<HTMLButtonElement>) {
    // Evita que el clic tanqui el picker de seguida via document.click
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setKeyPos({ x: rect.left, y: rect.bottom + 4 })
    setKeyOpen(true)
  }

  function handleKeyChange(newKey: string) {
    onChange({ ...value, key: newKey })
    setKeyOpen(false)
  }

  // ── Camps del panell "Més opcions" ──────────────────────

  function handleCapoChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, capo: parseInt(e.target.value, 10) || 0 })
  }

  function handleLanguageChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange({ ...value, language: e.target.value })
  }

  function handleTagsChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, tags: e.target.value })
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="song-header-edit">
      {/* Capçalera visual: replica l'estructura de SongView */}
      <div className="song-head">
        <div className="song-titles">
          {/* Títol editable inline */}
          {editing === "title" ? (
            <input
              ref={titleInputRef}
              className="song-title song-title-input"
              type="text"
              value={draft}
              autoFocus
              onFocus={handleInputFocus}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <div
              className={`song-title song-title--editable${!value.title ? " song-title--empty" : ""}`}
              role="button"
              tabIndex={0}
              title="Clica per editar el títol"
              onClick={() => startEditing("title")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") startEditing("title")
              }}
            >
              {value.title || "El títol de la cançó"}
            </div>
          )}

          {/* Artista editable inline */}
          {editing === "artist" ? (
            <input
              ref={artistInputRef}
              className="song-artist song-artist-input"
              type="text"
              value={draft}
              autoFocus
              onFocus={handleInputFocus}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleArtistKeyDown}
            />
          ) : (
            <p
              className={`song-artist song-artist--editable${!value.artist ? " song-artist--empty" : ""}`}
              role="button"
              tabIndex={0}
              title="Clica per editar l'artista"
              onClick={() => startEditing("artist")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") startEditing("artist")
              }}
            >
              {value.artist || "Autor o grup"}
            </p>
          )}
        </div>

        {/* Badge de tonalitat: obre el KeyPicker */}
        <div className="song-keys">
          <button
            type="button"
            className={`song-key key-badge${!value.key ? " key-badge--empty" : ""}`}
            onClick={handleOpenKeyPicker}
            title="Canvia la tonalitat"
          >
            {value.key || "Selecciona una tonalitat"}
          </button>
        </div>
      </div>

      {/* Camps secundaris sempre visibles: cejilla, idioma, etiquetes */}
      <div className="more-options-row">
        <label className="more-options-field more-options-field--inline">
          <span className="more-options-label">Cejilla</span>
          <input
            type="number"
            min={0}
            max={11}
            value={value.capo}
            onChange={handleCapoChange}
            className="more-options-input more-options-input--number"
          />
        </label>

        <label className="more-options-field more-options-field--inline">
          <span className="more-options-label">Idioma</span>
          <select
            value={value.language}
            onChange={handleLanguageChange}
            className="more-options-select"
          >
            <option value="ca">Català</option>
            <option value="es">Castellà</option>
            <option value="en">Anglès</option>
            <option value="other">Altre</option>
          </select>
        </label>

        <label className="more-options-field more-options-field--inline more-options-field--grow">
          <span className="more-options-label">Etiquetes</span>
          <input
            type="text"
            value={value.tags}
            placeholder="pop, rock, tradicional…"
            onChange={handleTagsChange}
            className="more-options-input"
          />
        </label>
      </div>

      {/* Popover de selecció de tonalitat */}
      <KeyPicker
        open={keyOpen}
        value={value.key}
        x={keyPos.x}
        y={keyPos.y}
        onChange={handleKeyChange}
        onClose={() => setKeyOpen(false)}
      />
    </div>
  )
}
