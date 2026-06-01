"use client"
import {
  type ChangeEvent,
  type ReactNode,
  useRef,
  useState,
} from "react"
import { KeyPicker } from "./KeyPicker"
import { getT } from "@/lib/i18n"

// Regex de validació de URLs de YouTube i Spotify (mateixos que als schemas Zod).
export const YOUTUBE_URL_REGEX = /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//
export const SPOTIFY_URL_REGEX = /^https?:\/\/open\.spotify\.com\//

// Tipus oficial de metadades de la cançó.
export interface SongMetadata {
  title: string
  artist: string
  key: string
  capo: number
  language: string
  tags: string
  album: string
  year: number | null
  youtubeUrl: string
  spotifyUrl: string
}

interface SongHeaderProps {
  value: SongMetadata
  onChange: (next: SongMetadata) => void
  /** Si false, els links són obligatoris i es marquen amb `*`. */
  isAdmin: boolean
}

// Quin camp inline-editable és en mode edició.
type EditingField = "title" | "artist" | "album" | "year" | null

// Posició del popover del KeyPicker
interface KeyPickerPos {
  x: number
  y: number
}

export function SongHeader({ value, onChange, isAdmin }: SongHeaderProps): ReactNode {
  const t = getT()
  // Camp en edició inline
  const [editing, setEditing] = useState<EditingField>(null)
  const [draft, setDraft] = useState<string>("")

  // Estat del KeyPicker
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyPos, setKeyPos] = useState<KeyPickerPos>({ x: 0, y: 0 })

  // Refs
  const titleInputRef = useRef<HTMLInputElement>(null)
  const artistInputRef = useRef<HTMLInputElement>(null)
  const albumInputRef = useRef<HTMLInputElement>(null)
  const yearInputRef = useRef<HTMLInputElement>(null)

  // ── Edició inline ───────────────────────────────────────

  function startEditing(field: EditingField) {
    if (field === null) return
    setEditing(field)
    if (field === "year") {
      setDraft(value.year != null ? String(value.year) : "")
    } else {
      setDraft(value[field])
    }
  }

  function commitEdit() {
    if (editing === null) return
    if (editing === "year") {
      const trimmed = draft.trim()
      let parsed: number | null = null
      if (trimmed !== "") {
        const n = parseInt(trimmed, 10)
        if (Number.isFinite(n)) parsed = n
      }
      onChange({ ...value, year: parsed })
    } else {
      onChange({ ...value, [editing]: draft })
    }
    setEditing(null)
  }

  function cancelEdit() {
    setEditing(null)
  }

  function handleInlineKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commitEdit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      cancelEdit()
    }
  }

  function handleInputFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.select()
  }

  // ── Badge de tonalitat ──────────────────────────────────

  function handleOpenKeyPicker(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setKeyPos({ x: rect.left, y: rect.bottom + 4 })
    setKeyOpen(true)
  }

  function handleKeyChange(newKey: string) {
    onChange({ ...value, key: newKey })
    setKeyOpen(false)
  }

  // ── Camps secundaris ────────────────────────────────────

  function handleCapoChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, capo: parseInt(e.target.value, 10) || 0 })
  }

  function handleLanguageChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange({ ...value, language: e.target.value })
  }

  function handleTagsChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, tags: e.target.value })
  }

  function handleYoutubeChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, youtubeUrl: e.target.value })
  }

  function handleSpotifyChange(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, spotifyUrl: e.target.value })
  }

  // ── Estat de validació dels links ───────────────────────
  const ytTrimmed = value.youtubeUrl.trim()
  const spTrimmed = value.spotifyUrl.trim()
  const ytInvalid = ytTrimmed !== "" && !YOUTUBE_URL_REGEX.test(ytTrimmed)
  const spInvalid = spTrimmed !== "" && !SPOTIFY_URL_REGEX.test(spTrimmed)

  const required = !isAdmin
  const ytLabel = required ? "YouTube *" : "YouTube"
  const spLabel = required ? "Spotify *" : "Spotify"

  return (
    <div className="song-header-edit">
      {/* Capçalera visual: replica l'estructura de SongView */}
      <div className="song-head">
        <div className="song-titles">
          {/* Títol editable inline (ocupa tota l'amplada) */}
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
              onKeyDown={handleInlineKeyDown}
            />
          ) : (
            <div
              className={`song-title song-title--editable${!value.title ? " song-title--empty" : ""}`}
              role="button"
              tabIndex={0}
              title={t.editor.songHeader.editarTitolTitle}
              onClick={() => startEditing("title")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") startEditing("title")
              }}
            >
              {value.title || "El títol de la cançó"}
            </div>
          )}

          {/* Fila secundària: artista · àlbum (any), tots tres inline-editables */}
          <div className="song-artist song-meta-row">
            {/* Artista */}
            {editing === "artist" ? (
              <input
                ref={artistInputRef}
                className="song-meta-input song-meta-input--artist"
                type="text"
                value={draft}
                autoFocus
                onFocus={handleInputFocus}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleInlineKeyDown}
              />
            ) : (
              <span
                className={`song-meta-part song-meta-part--editable${!value.artist ? " song-meta-part--empty" : ""}`}
                role="button"
                tabIndex={0}
                title={t.editor.songHeader.editarArtistaTitle}
                onClick={() => startEditing("artist")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") startEditing("artist")
                }}
              >
                {value.artist || "Autor o grup"}
              </span>
            )}

            <span className="song-meta-sep"> · </span>

            {/* Àlbum */}
            {editing === "album" ? (
              <input
                ref={albumInputRef}
                className="song-meta-input song-meta-input--album"
                type="text"
                value={draft}
                autoFocus
                onFocus={handleInputFocus}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleInlineKeyDown}
              />
            ) : (
              <span
                className={`song-meta-part song-meta-part--editable${!value.album ? " song-meta-part--empty" : ""}`}
                role="button"
                tabIndex={0}
                title={t.editor.songHeader.editarAlbumTitle}
                onClick={() => startEditing("album")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") startEditing("album")
                }}
              >
                {value.album || "Àlbum"}
              </span>
            )}

            <span className="song-meta-sep"> (</span>

            {/* Any */}
            {editing === "year" ? (
              <input
                ref={yearInputRef}
                className="song-meta-input song-meta-input--year"
                type="number"
                min={1000}
                max={2100}
                value={draft}
                autoFocus
                onFocus={handleInputFocus}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleInlineKeyDown}
              />
            ) : (
              <span
                className={`song-meta-part song-meta-part--editable${value.year == null ? " song-meta-part--empty" : ""}`}
                role="button"
                tabIndex={0}
                title={t.editor.songHeader.editarAnyTitle}
                onClick={() => startEditing("year")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") startEditing("year")
                }}
              >
                {value.year ?? "any"}
              </span>
            )}

            <span className="song-meta-sep">)</span>

            {/* Cellata (read-only aquí; s'edita a la fila de sota) */}
            {value.capo > 0 && (
              <>
                <span className="song-meta-sep"> · </span>
                <span className="song-meta-part">Celleta {value.capo}</span>
              </>
            )}
          </div>
        </div>

        {/* Badge de tonalitat: obre el KeyPicker */}
        <div className="song-keys">
          <button
            type="button"
            className={`song-key key-badge${!value.key ? " key-badge--empty" : ""}`}
            onClick={handleOpenKeyPicker}
            title={t.editor.songHeader.canviarTonalitatTitle}
          >
            {value.key || "Selecciona una tonalitat"}
          </button>
        </div>
      </div>

      {/* Fila de links streaming (YouTube + Spotify) */}
      <div className="song-links-row">
        <label className="more-options-field more-options-field--inline more-options-field--grow">
          <span className="more-options-label">{ytLabel}</span>
          <input
            type="url"
            value={value.youtubeUrl}
            placeholder={t.editor.songHeader.youtubePlaceholder}
            onChange={handleYoutubeChange}
            className={`more-options-input${ytInvalid ? " more-options-input--error" : ""}`}
          />
          {ytInvalid && (
            <span className="more-options-error">{t.editor.songHeader.youtubeUrlNoValida}</span>
          )}
        </label>

        <label className="more-options-field more-options-field--inline more-options-field--grow">
          <span className="more-options-label">{spLabel}</span>
          <input
            type="url"
            value={value.spotifyUrl}
            placeholder={t.editor.songHeader.spotifyPlaceholder}
            onChange={handleSpotifyChange}
            className={`more-options-input${spInvalid ? " more-options-input--error" : ""}`}
          />
          {spInvalid && (
            <span className="more-options-error">{t.editor.songHeader.spotifyUrlNoValida}</span>
          )}
        </label>
      </div>

      {/* Camps secundaris sempre visibles: cejilla, idioma, etiquetes */}
      <div className="more-options-row">
        <label className="more-options-field more-options-field--inline">
          <span className="more-options-label">{t.editor.songHeader.celleta}</span>
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
          <span className="more-options-label">{t.editor.songHeader.idioma}</span>
          <select
            value={value.language}
            onChange={handleLanguageChange}
            className="more-options-select"
          >
            <option value="ca">{t.editor.songHeader.catala}</option>
            <option value="es">{t.editor.songHeader.castella}</option>
            <option value="en">{t.editor.songHeader.angles}</option>
            <option value="other">{t.editor.songHeader.altre}</option>
          </select>
        </label>

        <label className="more-options-field more-options-field--inline more-options-field--grow">
          <span className="more-options-label">{t.editor.songHeader.etiquetes}</span>
          <input
            type="text"
            value={value.tags}
            placeholder={t.editor.songHeader.etiquetesPlaceholder}
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
