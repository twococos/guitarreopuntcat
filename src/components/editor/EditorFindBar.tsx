"use client"

/**
 * src/components/editor/EditorFindBar.tsx
 *
 * Barra de cerca i reemplaç pròpia de l'editor de cançons. Substitueix el
 * cercador del navegador (Ctrl+F) i cerca dins el contingut de l'editor:
 * lletra, acords i noms de secció.
 *
 * És un component controlat: tot l'estat (query, replace, comptador) viu al
 * WysiwygEditor, que també fa el ressaltat i la navegació sobre el DOM/model.
 */

import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

import { getT } from "@/lib/i18n"
import { IconSearch, IconX, IconChevronUp, IconChevronDown } from "@/components/shared/Icons"

interface EditorFindBarProps {
  open: boolean
  query: string
  replace: string
  /** Nombre total de coincidències. */
  total: number
  /** Índex 1-based de la coincidència activa (0 si no n'hi ha). */
  activeIndex: number
  onQueryChange: (q: string) => void
  onReplaceChange: (r: string) => void
  onNext: () => void
  onPrev: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function EditorFindBar({
  open,
  query,
  replace,
  total,
  activeIndex,
  onQueryChange,
  onReplaceChange,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: EditorFindBarProps): ReactNode {
  const t = getT()
  const searchRef = useRef<HTMLInputElement>(null)

  // En obrir-se, posa el focus al camp de cerca i selecciona'n el contingut
  // (perquè reescriure sigui immediat, com fa el cercador natiu).
  useEffect(() => {
    if (open) {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }, [open])

  if (!open) return null

  const hasQuery = query !== ""
  const noResults = hasQuery && total === 0

  return (
    <div className="editor-find-bar" role="search">
      <div className="editor-find-row">
        <span className="editor-find-icon" aria-hidden="true">
          <IconSearch />
        </span>
        <input
          ref={searchRef}
          type="text"
          className="editor-find-input"
          placeholder={t.editor.findBar.cercaPlaceholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (e.shiftKey) onPrev()
              else onNext()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span
          className={`editor-find-count${noResults ? " editor-find-count--empty" : ""}`}
        >
          {noResults
            ? t.editor.findBar.senseResultats
            : total > 0
              ? t.editor.findBar.comptador(activeIndex, total)
              : ""}
        </span>
        <button
          type="button"
          className="editor-find-btn"
          title={t.editor.findBar.anteriorTitle}
          onClick={onPrev}
          disabled={total === 0}
        >
          <IconChevronUp />
        </button>
        <button
          type="button"
          className="editor-find-btn"
          title={t.editor.findBar.seguentTitle}
          onClick={onNext}
          disabled={total === 0}
        >
          <IconChevronDown />
        </button>
        <button
          type="button"
          className="editor-find-btn"
          title={t.editor.findBar.tancaTitle}
          onClick={onClose}
        >
          <IconX />
        </button>
      </div>

      <div className="editor-find-row">
        <span className="editor-find-icon" aria-hidden="true" />
        <input
          type="text"
          className="editor-find-input"
          placeholder={t.editor.findBar.reemplacaPlaceholder}
          value={replace}
          onChange={(e) => onReplaceChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onReplaceOne()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <button
          type="button"
          className="editor-find-btn editor-find-btn--text"
          title={t.editor.findBar.reemplacaTitle}
          onClick={onReplaceOne}
          disabled={total === 0}
        >
          {t.editor.findBar.reemplaca}
        </button>
        <button
          type="button"
          className="editor-find-btn editor-find-btn--text"
          title={t.editor.findBar.reemplacaTotTitle}
          onClick={onReplaceAll}
          disabled={total === 0}
        >
          {t.editor.findBar.reemplacaTot}
        </button>
      </div>
    </div>
  )
}
