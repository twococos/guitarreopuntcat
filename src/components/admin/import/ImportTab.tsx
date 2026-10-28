"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { MATCH_BATCH_MAX } from "@/lib/schemas/import"
import { cleanTrackTitle, type SpotifyTrack } from "@/lib/spotify/url"
import { SpotifyImportBar } from "./SpotifyImportBar"
import { ImportReview, type EnqueueOptions } from "./ImportReview"
import type { ImportSource, MatchResult, ReviewRow } from "./types"

const STORAGE_KEY = "admin.import.review"

type EnqueueResult = { index: number; status: "queued" | "duplicate" | "error"; error?: string }

/** "url[, títol, artista]" per línia. */
function parseLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [url, title, artist] = l.split(",").map((p) => p.trim())
      return {
        mode: "new" as const,
        source_url: url,
        ...(title ? { title } : {}),
        ...(artist ? { artist } : {}),
      }
    })
}

/** Una cançó és segura si el millor vídeo ho és i no existeix ni és a la cua. */
function autoChecked(m: MatchResult): boolean {
  const best = m.candidates[0]
  return (
    !!best &&
    best.confidence === "high" &&
    m.duplicate_song_id === null &&
    m.queued_job === null &&
    !m.existing_jobs[best.video_id]
  )
}

interface Stored {
  rows: ReviewRow[]
  sources: ImportSource[]
}

function loadStored(): Stored {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { rows: [], sources: [] }
    const data = JSON.parse(raw) as Stored
    // Les cerques que no havien acabat es tornen a fer
    return {
      rows: data.rows.map((r) => (r.status === "matching" ? { ...r, status: "pending" } : r)),
      sources: data.sources,
    }
  } catch {
    return { rows: [], sources: [] }
  }
}

/**
 * Pestanya «Importar cançons» de l'admin: Spotify (enllaç o cerca) → vídeo de
 * YouTube → revisió → cua de transcripcions. A sota, encuar enllaços de YouTube
 * a mà i l'anàlisi de les cançons ja publicades.
 */
export function ImportTab({ onGoToQueue }: { onGoToQueue: () => void }) {
  const t = getT()
  const ti = t.admin.importTab
  const toast = useToastStore.getState().show

  const [rows, setRows] = useState<ReviewRow[]>([])
  const [sources, setSources] = useState<ImportSource[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState("")
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const matchingRef = useRef(false)

  // La llista sobreviu als canvis de pestanya (sessionStorage); es llegeix després de muntar
  useEffect(() => {
    const stored = loadStored()
    setRows(stored.rows)
    setSources(stored.sources)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, sources }))
    } catch {
      // Sense sessionStorage la llista només dura mentre la pestanya és oberta
    }
  }, [rows, sources, hydrated])

  // Cerca dels vídeos: lots petits en sèrie, perquè la llista es vagi omplint
  useEffect(() => {
    if (!hydrated || matchingRef.current) return
    const batch = rows.filter((r) => r.status === "pending").slice(0, MATCH_BATCH_MAX)
    if (batch.length === 0) return
    matchingRef.current = true
    const keys = new Set(batch.map((r) => r.key))
    setRows((prev) => prev.map((r) => (keys.has(r.key) ? { ...r, status: "matching" } : r)))
    ;(async () => {
      let results: MatchResult[] | null = null
      try {
        const res = await fetch("/api/admin/import/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks: batch.map((r) => r.track) }),
        })
        if (res.ok) results = ((await res.json()) as { results: MatchResult[] }).results
      } catch {
        results = null
      }
      setRows((prev) =>
        prev.map((r) => {
          if (!keys.has(r.key)) return r
          const i = batch.findIndex((b) => b.key === r.key)
          const m = results?.[i]
          if (!m) {
            // Error de xarxa o del servidor: queda com si YouTube no hagués respost
            return {
              ...r,
              status: "ready",
              match: {
                track: r.track,
                title: r.track.title,
                artist: r.track.artists[0] ?? "",
                candidates: [],
                youtube_error: true,
                duplicate_song_id: null,
                queued_job: null,
                existing_jobs: {},
              },
            }
          }
          return {
            ...r,
            track: m.track,
            status: "ready",
            match: m,
            videoId: m.candidates[0]?.video_id ?? null,
            checked: autoChecked(m),
          }
        }),
      )
      matchingRef.current = false
    })()
  }, [rows, hydrated])

  const addTracks = useCallback((tracks: SpotifyTrack[], source: ImportSource) => {
    setRows((prev) => {
      const have = new Set(prev.map((r) => r.key))
      const fresh = tracks
        .filter((tr) => !have.has(tr.spotify_id))
        .map(
          (tr): ReviewRow => ({
            key: tr.spotify_id,
            track: tr,
            status: "pending",
            match: null,
            videoId: null,
            customVideoId: null,
            checked: false,
            enqueueError: null,
          }),
        )
      // Uniques, en l'ordre de la font
      const seen = new Set<string>()
      return [...prev, ...fresh.filter((r) => !seen.has(r.key) && seen.add(r.key))]
    })
    setSources((prev) => {
      // Les cerques s'agrupen en una sola entrada
      if (source.kind === "search") {
        const existing = prev.find((s) => s.kind === "search")
        if (existing) return prev.map((s) => (s === existing ? { ...s, count: s.count + source.count } : s))
      }
      return [...prev, source]
    })
  }, [])

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function retryRow(key: string) {
    updateRow(key, { status: "pending", match: null, videoId: null, checked: false })
  }

  function clearAll() {
    setRows([])
    setSources([])
  }

  async function postEnqueue(body: unknown): Promise<unknown> {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      return (await res.json()) as unknown
    } catch {
      toast(t.admin.toasts.errorEncuar, { type: "error" })
      return null
    } finally {
      setBusy(false)
    }
  }

  // Toast + avís a dalt de la pestanya amb un botó per anar a la cua
  function queuedToast(text: string, isError: boolean) {
    toast(text, { type: isError ? "error" : "success", durationMs: 5000 })
    setNotice({ text, error: isError })
  }

  async function enqueueReview(opts: EnqueueOptions) {
    const chosen = rows.filter((r) => r.checked && r.videoId && r.match)
    if (chosen.length === 0) return
    const jobs = chosen.map((r) => {
      const m = r.match!
      return {
        mode: "new" as const,
        source_url: `https://www.youtube.com/watch?v=${r.videoId}`,
        title: m.title,
        artist: m.artist,
        spotify_url: r.track.url,
        ...(r.track.album ? { album: cleanTrackTitle(r.track.album) } : {}),
        ...(r.track.year ? { year: r.track.year } : {}),
        ...(r.track.duration_ms > 0 ? { duration_s: Math.round(r.track.duration_ms / 1000) } : {}),
        ...(opts.language ? { language: opts.language } : {}),
      }
    })
    const data = (await postEnqueue({ jobs, priority: opts.priority ? 1 : 0 })) as { results: EnqueueResult[] } | null
    if (!data) return
    const queued = new Set<string>()
    const errors = new Map<string, string>()
    for (const r of data.results) {
      const key = chosen[r.index]?.key
      if (!key) continue
      if (r.status === "queued") queued.add(key)
      else errors.set(key, r.error ?? r.status)
    }
    setRows((prev) =>
      prev
        .filter((r) => !queued.has(r.key))
        .map((r) => (errors.has(r.key) ? { ...r, checked: false, enqueueError: errors.get(r.key)! } : r)),
    )
    queuedToast(
      errors.size > 0
        ? t.admin.toasts.transcripcionsEncuades(queued.size, 0, errors.size)
        : ti.encuades(queued.size),
      errors.size > 0,
    )
  }

  async function handleEnqueueLines() {
    const jobs = parseLines(lines)
    if (jobs.length === 0) return
    const data = (await postEnqueue({ jobs })) as { results: EnqueueResult[] } | null
    if (!data) return
    const count = (s: EnqueueResult["status"]) => data.results.filter((r) => r.status === s).length
    queuedToast(t.admin.toasts.transcripcionsEncuades(count("queued"), count("duplicate"), count("error")), count("error") > 0)
    if (count("error") === 0) setLines("")
  }

  async function handleAnalyzeMissing(missing: true | "rhythm") {
    if (!confirm(missing === "rhythm" ? ti.confirmAnalitzarSenseRitme : ti.confirmAnalitzarFalten)) return
    const data = (await postEnqueue({ analyzeMissing: missing })) as { queued: number } | null
    if (data) queuedToast(t.admin.toasts.transcripcionsEncuades(data.queued, 0, 0), false)
  }

  return (
    <div className="transcriptions-tab import-tab">
      {notice && (
        <div className={`import-notice ${notice.error ? "is-error" : ""}`}>
          <span>{notice.text}</span>
          <button className="btn-xs success" onClick={onGoToQueue}>
            {ti.veureCua}
          </button>
          <button className="btn-xs" onClick={() => setNotice(null)} aria-label={t.admin.transcriptionsTab.tancar}>
            ×
          </button>
        </div>
      )}
      <section className="transcriptions-section">
        <h3>{ti.spotifyTitol}</h3>
        <p className="transcriptions-hint">{ti.spotifyHint}</p>
        <SpotifyImportBar addedKeys={rows.map((r) => r.key)} onAdd={addTracks} />
      </section>

      <ImportReview
        rows={rows}
        sources={sources}
        busy={busy}
        onUpdate={updateRow}
        onRemove={removeRow}
        onRetry={retryRow}
        onClear={clearAll}
        onEnqueue={enqueueReview}
      />

      <section className="transcriptions-section">
        <h3>{ti.manualTitol}</h3>
        <p className="transcriptions-hint">{ti.encuarHint}</p>
        <textarea
          className="transcriptions-textarea"
          rows={4}
          placeholder={ti.encuarPlaceholder}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          disabled={busy}
        />
        <div className="panel-toolbar">
          <button className="btn-xs success" onClick={handleEnqueueLines} disabled={busy || !lines.trim()}>
            {ti.encuar}
          </button>
        </div>
      </section>

      <section className="transcriptions-section">
        <h3>{ti.analitzarTitol}</h3>
        <div className="panel-toolbar">
          <button className="btn-xs" onClick={() => handleAnalyzeMissing(true)} disabled={busy} title={ti.analitzarFaltenTitle}>
            {ti.analitzarFalten}
          </button>
          <button
            className="btn-xs"
            onClick={() => handleAnalyzeMissing("rhythm")}
            disabled={busy}
            title={ti.analitzarSenseRitmeTitle}
          >
            {ti.analitzarSenseRitme}
          </button>
        </div>
      </section>
    </div>
  )
}
