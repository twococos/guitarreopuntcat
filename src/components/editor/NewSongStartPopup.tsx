"use client"

import { useState } from "react"
import type { ImportResult } from "@/lib/importers"
import { isSupportedUrl, SUPPORTED_HOSTS } from "@/lib/importers"
import { getT } from "@/lib/i18n"

interface NewSongStartPopupProps {
  onManual: () => void
  onImported: (data: ImportResult) => void
}

export function NewSongStartPopup({ onManual, onImported }: NewSongStartPopupProps) {
  const t = getT()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const trimmed = url.trim()
  const isEmpty = trimmed === ""
  const supported = !isEmpty && isSupportedUrl(trimmed)

  let variantClass: string
  let isDisabled: boolean
  let buttonText: string

  if (loading) {
    variantClass = "btn-start--loading"
    isDisabled = true
    buttonText = t.editor.newSong.important
  } else if (isEmpty) {
    variantClass = "btn-start--idle"
    isDisabled = true
    buttonText = t.editor.newSong.comenca
  } else if (!supported) {
    variantClass = "btn-start--unsupported"
    isDisabled = true
    buttonText = t.editor.newSong.linkNoSuportat
  } else {
    variantClass = "btn-start--supported"
    isDisabled = false
    buttonText = t.editor.newSong.comenca
  }

  async function handleStart() {
    setLoading(true)
    setServerError(null)
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? t.editor.newSong.noSHaPogutImportar)
      }
      const data = (await res.json()) as ImportResult
      onImported(data)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t.editor.newSong.errorDesconegut)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="new-song-overlay">
      <div id="new-song-box">
        <div id="new-song-logo">🎵</div>
        <h2>{t.editor.newSong.titol}</h2>

        <div className="new-song-section">
          <p className="new-song-section-title">{t.editor.newSong.comecarDesDeEnllac}</p>
          <input
            type="url"
            className="url-input"
            placeholder={t.editor.newSong.urlPlaceholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <small className="new-song-hint">
            Suportat: {SUPPORTED_HOSTS.join(", ")}
          </small>
          <button
            className={`btn-start ${variantClass}`}
            disabled={isDisabled}
            onClick={handleStart}
          >
            {buttonText}
          </button>
          {serverError && <p className="import-error">{serverError}</p>}
        </div>

        <div className="new-song-divider"><span>{t.editor.newSong.o}</span></div>

        <div className="new-song-section">
          <button className="btn-manual" onClick={onManual} disabled={loading}>
            {t.editor.newSong.introduirManualment}
          </button>
        </div>
      </div>
    </div>
  )
}
