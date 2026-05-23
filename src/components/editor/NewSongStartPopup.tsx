"use client"

import { useState } from "react"
import type { ImportResult } from "@/lib/importers"
import { isSupportedUrl, SUPPORTED_HOSTS } from "@/lib/importers"

interface NewSongStartPopupProps {
  onManual: () => void
  onImported: (data: ImportResult) => void
}

export function NewSongStartPopup({ onManual, onImported }: NewSongStartPopupProps) {
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
    buttonText = "Important…"
  } else if (isEmpty) {
    variantClass = "btn-start--idle"
    isDisabled = true
    buttonText = "Comença"
  } else if (!supported) {
    variantClass = "btn-start--unsupported"
    isDisabled = true
    buttonText = "Link no suportat"
  } else {
    variantClass = "btn-start--supported"
    isDisabled = false
    buttonText = "Comença"
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
        throw new Error(data?.error ?? "No s'ha pogut importar la cançó.")
      }
      const data = (await res.json()) as ImportResult
      onImported(data)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error desconegut.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="new-song-overlay">
      <div id="new-song-box">
        <div id="new-song-logo">🎵</div>
        <h2>Nova cançó</h2>

        <div className="new-song-section">
          <p className="new-song-section-title">Començar des d&apos;un enllaç:</p>
          <input
            type="url"
            className="url-input"
            placeholder="https://..."
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

        <div className="new-song-divider"><span>o</span></div>

        <div className="new-song-section">
          <button className="btn-manual" onClick={onManual} disabled={loading}>
            Introduir manualment
          </button>
        </div>
      </div>
    </div>
  )
}
