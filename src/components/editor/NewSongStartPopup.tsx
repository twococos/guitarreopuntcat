"use client"

import { useState } from "react"
import type { ImportResult } from "@/lib/importers"
import { isSupportedUrl, SUPPORTED_HOSTS } from "@/lib/importers"
import { getT } from "@/lib/i18n"
import { youtubeVideoId } from "@/lib/youtube"
import { IconMusic } from "@/components/shared/Icons"

interface NewSongStartPopupProps {
  onManual: () => void
  onImported: (data: ImportResult) => void
}

export function NewSongStartPopup({ onManual, onImported }: NewSongStartPopupProps) {
  const t = getT()
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null)

  const trimmed = url.trim()
  const isEmpty = trimmed === ""
  const supported = !isEmpty && isSupportedUrl(trimmed)
  // Un vídeo de YouTube no és una web d'acords: s'envia a la cua del transcriptor
  const isYoutube = !isEmpty && !supported && youtubeVideoId(trimmed) !== null

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
  } else if (isYoutube) {
    variantClass = "btn-start--supported"
    isDisabled = false
    buttonText = t.editor.newSong.transcriure
  } else if (!supported) {
    variantClass = "btn-start--unsupported"
    isDisabled = true
    buttonText = t.editor.newSong.linkNoSuportat
  } else {
    variantClass = "btn-start--supported"
    isDisabled = false
    buttonText = t.editor.newSong.comenca
  }

  async function handleTranscribe() {
    setLoading(true)
    setServerError(null)
    setQueuedMessage(null)
    try {
      const res = await fetch("/api/admin/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: [{ mode: "new", source_url: trimmed }] }),
      })
      if (!res.ok) throw new Error(t.editor.newSong.noSHaPogutImportar)
      const data = (await res.json()) as { results: { status: string; error?: string }[] }
      const r = data.results[0]
      if (r?.status === "queued") {
        setQueuedMessage(t.editor.newSong.transcriureEncuada)
        setUrl("")
      } else if (r?.status === "duplicate") {
        setServerError(t.editor.newSong.transcriureDuplicada)
      } else {
        throw new Error(r?.error ?? t.editor.newSong.noSHaPogutImportar)
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t.editor.newSong.errorDesconegut)
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    if (isYoutube) return handleTranscribe()
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
        <div id="new-song-logo"><IconMusic /></div>
        <h2>{t.editor.newSong.titol}</h2>

        <div className="new-song-section">
          <p className="new-song-section-title">{t.editor.newSong.comecarDesDeEnllac}</p>
          <input
            type="url"
            className="url-input"
            placeholder={t.editor.newSong.urlPlaceholder}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setQueuedMessage(null)
            }}
            disabled={loading}
            autoFocus
          />
          <small className="new-song-hint">
            Suportat: {SUPPORTED_HOSTS.join(", ")}
          </small>
          {isYoutube && <small className="new-song-hint">{t.editor.newSong.transcriureHint}</small>}
          <button
            className={`btn-start ${variantClass}`}
            disabled={isDisabled}
            onClick={handleStart}
          >
            {buttonText}
          </button>
          {serverError && <p className="import-error">{serverError}</p>}
          {queuedMessage && (
            <p className="new-song-hint">
              {queuedMessage} <a href="/app/admin?tab=transcriptions">{t.editor.newSong.veureCua}</a>
            </p>
          )}
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
