"use client"
import { useState } from "react"
import { getT } from "@/lib/i18n"
import { youtubeVideoId } from "@/lib/youtube"
import type { ScoredCandidate } from "@/lib/youtube/match"
import type { ImportSource, ReviewRow } from "./types"
import { formatMs, formatSecondsClock } from "./format"

export interface EnqueueOptions {
  language: string | null
  priority: boolean
}

interface Props {
  rows: ReviewRow[]
  sources: ImportSource[]
  busy: boolean
  onUpdate: (key: string, patch: Partial<ReviewRow>) => void
  onRemove: (key: string) => void
  onRetry: (key: string) => void
  onClear: () => void
  onEnqueue: (opts: EnqueueOptions) => void
}

const LANGUAGES = ["ca", "es", "en", "fr", "it", "pt"]

function statusLabel(status: string): string {
  const labels: Record<string, string> = getT().admin.transcriptionsTab.statusLabels
  return labels[status] ?? status
}

function deltaClass(delta: number | null): string {
  if (delta === null) return "is-bad"
  const d = Math.abs(delta)
  return d <= 3 ? "is-good" : d <= 10 ? "is-warn" : "is-bad"
}

/** Llista «Per encuar»: cada cançó de Spotify amb el vídeo triat i les alternatives. */
export function ImportReview({ rows, sources, busy, onUpdate, onRemove, onRetry, onClear, onEnqueue }: Props) {
  const t = getT()
  const ti = t.admin.importTab
  const [language, setLanguage] = useState<string>("")
  const [priority, setPriority] = useState(false)

  const done = rows.filter((r) => r.status === "ready").length
  const searching = done < rows.length
  const selectable = rows.filter((r) => r.status === "ready" && r.videoId && r.match)
  const checkedCount = rows.filter((r) => r.checked && r.videoId && r.match).length

  function checkSafe() {
    for (const r of selectable) {
      const m = r.match!
      const best = m.candidates[0]
      const safe =
        best?.video_id === r.videoId &&
        best.confidence === "high" &&
        m.duplicate_song_id === null &&
        m.queued_job === null &&
        !m.existing_jobs[best.video_id]
      if (safe !== r.checked) onUpdate(r.key, { checked: safe })
    }
  }

  return (
    <section className="transcriptions-section">
      <div className="panel-toolbar">
        <h3>{ti.revisioTitol(rows.length)}</h3>
        {sources.map((s, i) => (
          <span key={i} className="badge badge-user" title={s.truncated ? ti.retallada : undefined}>
            {ti.origen[s.kind]}
            {s.kind !== "search" && s.name && `: ${s.name}`} · {s.count}
            {s.truncated && " ⚠"}
          </span>
        ))}
        {searching && <span className="transcriptions-hint import-progress">{ti.progres(done, rows.length)}</span>}
      </div>
      {sources.some((s) => s.truncated) && <p className="transcriptions-hint">{ti.retallada}</p>}

      {rows.length === 0 ? (
        <p className="transcriptions-hint">{ti.capRevisio}</p>
      ) : (
        <>
          <div className="panel-toolbar">
            <button className="btn-xs" onClick={checkSafe} disabled={selectable.length === 0}>
              {ti.marcaBones}
            </button>
            <button
              className="btn-xs"
              onClick={() => rows.forEach((r) => r.checked && onUpdate(r.key, { checked: false }))}
              disabled={checkedCount === 0}
            >
              {ti.desmarcaTotes}
            </button>
            <button className="btn-xs danger" onClick={() => confirm(ti.confirmBuida) && onClear()}>
              {ti.buida}
            </button>
            <label className="import-option">
              {ti.idioma}
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">{ti.idiomaAuto}</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="import-option" title={ti.prioritatAltaTitle}>
              <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} />
              {ti.prioritatAlta}
            </label>
            <button
              className="btn-xs success"
              disabled={busy || checkedCount === 0}
              onClick={() => onEnqueue({ language: language || null, priority })}
            >
              {ti.encuaN(checkedCount)}
            </button>
          </div>

          <table className="import-table">
            <thead>
              <tr>
                <th />
                <th>{ti.colCanco}</th>
                <th>{ti.colVideo}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ReviewRowView
                  key={r.key}
                  row={r}
                  onUpdate={(patch) => onUpdate(r.key, patch)}
                  onRemove={() => onRemove(r.key)}
                  onRetry={() => onRetry(r.key)}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function ReviewRowView({
  row,
  onUpdate,
  onRemove,
  onRetry,
}: {
  row: ReviewRow
  onUpdate: (patch: Partial<ReviewRow>) => void
  onRemove: () => void
  onRetry: () => void
}) {
  const t = getT()
  const ti = t.admin.importTab
  const [expanded, setExpanded] = useState(false)
  const [pasted, setPasted] = useState("")
  const [pasteError, setPasteError] = useState(false)
  const { track, match } = row
  const selected = match?.candidates.find((c) => c.video_id === row.videoId) ?? null
  const existingJob = row.videoId ? match?.existing_jobs[row.videoId] : undefined
  const canCheck = row.status === "ready" && !!row.videoId

  function applyPasted() {
    const id = youtubeVideoId(pasted.trim())
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
      setPasteError(true)
      return
    }
    onUpdate({ videoId: id, customVideoId: id, checked: true, enqueueError: null })
    setPasted("")
    setPasteError(false)
    setExpanded(false)
  }

  return (
    <>
      <tr className={`import-row ${row.checked ? "is-checked" : ""}`}>
        <td>
          <input
            type="checkbox"
            checked={row.checked}
            disabled={!canCheck}
            onChange={(e) => onUpdate({ checked: e.target.checked, enqueueError: null })}
          />
        </td>
        <td>
          <div className="import-track">
            {track.image_url ? <img src={track.image_url} alt="" /> : <span className="import-cover-empty" />}
            <div>
              <a href={track.url} target="_blank" rel="noreferrer">
                <strong>{match?.title ?? track.title}</strong>
              </a>
              <div className="import-meta">
                {track.artists.join(", ")}
                {track.album && ` · ${track.album}`}
                {track.year && ` · ${track.year}`} · {formatMs(track.duration_ms)}
              </div>
              <div className="import-flags">
                {match?.duplicate_song_id && (
                  <a className="badge danger" href={`/app/admin?tab=songs&focus=${match.duplicate_song_id}`}>
                    {ti.jaExisteix}
                  </a>
                )}
                {match?.queued_job && <span className="badge badge-draft">{ti.jaALaCua}</span>}
                {row.enqueueError && <span className="transcriptions-error">{ti.errorEncuar(row.enqueueError)}</span>}
              </div>
            </div>
          </div>
        </td>
        <td>
          {row.status !== "ready" ? (
            <span className="transcriptions-hint">{ti.buscantVideo}</span>
          ) : row.customVideoId && row.videoId === row.customVideoId ? (
            <VideoCell videoId={row.customVideoId} title={ti.videoEnganxat} />
          ) : selected ? (
            <VideoCell videoId={selected.video_id} title={selected.title} candidate={selected} />
          ) : (
            <span className="transcriptions-error">{match?.youtube_error ? ti.errorYoutube : ti.senseVideo}</span>
          )}
          {existingJob && <div className="transcriptions-error">{ti.videoJaTeFeina(statusLabel(existingJob.status))}</div>}
        </td>
        <td className="td-actions">
          {row.status === "ready" && (
            <button className="btn-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? ti.amaga : ti.canvia}
            </button>
          )}
          {row.status === "ready" && match?.youtube_error && (
            <button className="btn-xs" onClick={onRetry}>
              {ti.tornaAProvar}
            </button>
          )}
          <button className="btn-xs danger" onClick={onRemove} title={ti.treu} aria-label={ti.treu}>
            ×
          </button>
        </td>
      </tr>
      {expanded && match && (
        <tr className="import-alternatives">
          <td />
          <td colSpan={3}>
            <ul>
              {match.candidates.map((c) => (
                <li key={c.video_id}>
                  <label>
                    <input
                      type="radio"
                      name={`video-${row.key}`}
                      checked={row.videoId === c.video_id}
                      onChange={() => onUpdate({ videoId: c.video_id, checked: true, enqueueError: null })}
                    />
                    <VideoCell videoId={c.video_id} title={c.title} candidate={c} />
                  </label>
                </li>
              ))}
            </ul>
            <div className="panel-toolbar import-paste">
              <input
                type="text"
                value={pasted}
                placeholder={ti.enganxaVideo}
                onChange={(e) => {
                  setPasted(e.target.value)
                  setPasteError(false)
                }}
                onKeyDown={(e) => e.key === "Enter" && applyPasted()}
              />
              <button className="btn-xs" onClick={applyPasted} disabled={!pasted.trim()}>
                {ti.usa}
              </button>
              {pasteError && <span className="transcriptions-error">{ti.videoInvalid}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function VideoCell({ videoId, title, candidate }: { videoId: string; title: string; candidate?: ScoredCandidate }) {
  const ti = getT().admin.importTab
  const url = `https://www.youtube.com/watch?v=${videoId}`
  return (
    <div className="import-video">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" />
      </a>
      <div>
        <a href={url} target="_blank" rel="noreferrer">
          {title}
        </a>
        {candidate && (
          <div className="import-meta">
            {candidate.channel}
            {candidate.duration_s !== null && ` · ${formatSecondsClock(candidate.duration_s)}`}
          </div>
        )}
        {candidate && (
          <div className="import-flags">
            <span className={`import-delta ${deltaClass(candidate.delta_s)}`} title={ti.deltaTitle}>
              {candidate.delta_s === null ? "?" : ti.delta(candidate.delta_s)}
            </span>
            <span className={`import-confidence is-${candidate.confidence}`}>{ti.confianca[candidate.confidence]}</span>
            {candidate.topic && <span className="import-tag">{ti.topic}</span>}
            {candidate.official && <span className="import-tag">{ti.oficial}</span>}
            {candidate.other_version && (
              <span className="transcriptions-error">{ti.altraVersio(candidate.other_version)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
