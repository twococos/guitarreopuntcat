"use client"
import { Fragment, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { JobStatsView, formatSeconds } from "./JobStatsView"

type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled"

interface JobRow {
  id: number
  mode: "new" | "analyze"
  source_url: string
  title: string | null
  artist: string | null
  song_id: number | null
  status: JobStatus
  worker_name: string | null
  attempts: number
  not_before: string | null
  error: string | null
  result_song_id: number | null
  result_proposal_id: number | null
  elapsed_seconds: number | null
  stats: Record<string, unknown> | null
}

type LeaderboardKey = "songs" | "total_time" | "speed"

interface LeaderboardBoard {
  top: { rank: number; worker_id: number; name: string; value: number }[]
}

interface Leaderboards {
  min_songs_speed: number
  periods: Record<"all" | "month", Record<LeaderboardKey, LeaderboardBoard>>
}

interface WorkerRow {
  id: number
  name: string
  active: boolean
  device_info: { type: string; name: string; vram_gb: number; hostname?: string } | null
  app_version: string | null
  last_seen_at: string | null
  jobs_done: number
  avg_seconds: number | null
}

interface QueueState {
  jobs: JobRow[]
  counts: Partial<Record<JobStatus, number>>
  workers: WorkerRow[]
  leaderboards: Leaderboards | null
}

type EnqueueResult = { status: "queued" | "duplicate" | "error" }

const REFRESH_MS = 10_000

const STATUS_BADGE: Record<JobStatus, string> = {
  queued: "badge-user",
  running: "badge-draft",
  done: "badge-public",
  failed: "badge danger",
  cancelled: "badge-inactive",
}

/** Les dates de SQLite són UTC sense zona ("YYYY-MM-DD HH:MM:SS"). */
function formatDate(sqliteDate: string | null): string {
  if (!sqliteDate) return ""
  return new Date(`${sqliteDate.replace(" ", "T")}Z`).toLocaleString("ca-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—"
  const s = Math.round(seconds)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

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

export function TranscriptionsTab() {
  const t = getT()
  const tt = t.admin.transcriptionsTab
  const router = useRouter()
  const toast = useToastStore.getState().show
  const [state, setState] = useState<QueueState>({ jobs: [], counts: {}, workers: [], leaderboards: null })
  const [openStats, setOpenStats] = useState<Set<number>>(new Set())
  const [period, setPeriod] = useState<"all" | "month">("all")
  const [lines, setLines] = useState("")
  const [busy, setBusy] = useState(false)
  const [workerName, setWorkerName] = useState("")
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/transcriptions")
    if (!res.ok) return
    setState((await res.json()) as QueueState)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  async function enqueue(body: unknown): Promise<unknown> {
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
      load()
    }
  }

  async function handleEnqueue() {
    const jobs = parseLines(lines)
    if (jobs.length === 0) return
    const data = (await enqueue({ jobs })) as { results: EnqueueResult[] } | null
    if (!data) return
    const count = (s: EnqueueResult["status"]) => data.results.filter((r) => r.status === s).length
    toast(t.admin.toasts.transcripcionsEncuades(count("queued"), count("duplicate"), count("error")), {
      type: count("error") > 0 ? "error" : "success",
      durationMs: 5000,
    })
    if (count("error") === 0) setLines("")
  }

  async function handleAnalyzeMissing(missing: true | "rhythm") {
    if (!confirm(missing === "rhythm" ? tt.confirmAnalitzarSenseRitme : tt.confirmAnalitzarFalten)) return
    const data = (await enqueue({ analyzeMissing: missing })) as { queued: number } | null
    if (data) toast(t.admin.toasts.transcripcionsEncuades(data.queued, 0, 0), { type: "success" })
  }

  async function handleJobAction(id: number, action: "cancel" | "retry") {
    const res = await fetch(`/api/admin/transcriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) toast(t.admin.toasts.errorAccio, { type: "error" })
    load()
  }

  async function handleCreateWorker() {
    const name = workerName.trim()
    if (!name) return
    const res = await fetch("/api/admin/transcription-workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      toast(t.admin.toasts.errorAccio, { type: "error" })
      return
    }
    const data = (await res.json()) as { token: string }
    setNewToken({ name, token: data.token })
    setWorkerName("")
    load()
  }

  async function handleWorker(w: WorkerRow, action: "toggle" | "delete") {
    if (action === "delete" && !confirm(tt.confirmEliminarWorker(w.name))) return
    const res = await fetch(`/api/admin/transcription-workers/${w.id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ active: !w.active }),
    })
    if (!res.ok) toast(t.admin.toasts.errorAccio, { type: "error" })
    load()
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      toast(t.admin.toasts.copiat, { type: "success" })
    } catch {
      toast(t.admin.toasts.errorCopiar, { type: "error" })
    }
  }

  function toggleStats(id: number) {
    setOpenStats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function formatLeaderboardValue(key: LeaderboardKey, value: number): string {
    if (key === "songs") return tt.cancons(value)
    if (key === "speed") return tt.perMinut(formatSeconds(value))
    return formatSeconds(value)
  }

  const statuses: JobStatus[] = ["queued", "running", "done", "failed", "cancelled"]
  const boards = state.leaderboards?.periods[period]

  return (
    <div className="transcriptions-tab">
      <section className="transcriptions-section">
        <h3>{tt.encuarTitol}</h3>
        <p className="transcriptions-hint">{tt.encuarHint}</p>
        <textarea
          className="transcriptions-textarea"
          rows={4}
          placeholder={tt.encuarPlaceholder}
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          disabled={busy}
        />
        <div className="panel-toolbar">
          <button className="btn-xs success" onClick={handleEnqueue} disabled={busy || !lines.trim()}>
            {tt.encuar}
          </button>
          <button className="btn-xs" onClick={() => handleAnalyzeMissing(true)} disabled={busy} title={tt.analitzarFaltenTitle}>
            {tt.analitzarFalten}
          </button>
          <button
            className="btn-xs"
            onClick={() => handleAnalyzeMissing("rhythm")}
            disabled={busy}
            title={tt.analitzarSenseRitmeTitle}
          >
            {tt.analitzarSenseRitme}
          </button>
        </div>
      </section>

      <section className="transcriptions-section">
        <div className="panel-toolbar">
          <h3>{tt.cuaTitol}</h3>
          {statuses.map((s) => (
            <span key={s} className={`badge ${STATUS_BADGE[s]}`}>
              {tt.statusLabels[s]}: {state.counts[s] ?? 0}
            </span>
          ))}
          <button className="btn-xs" onClick={load}>
            {tt.actualitzar}
          </button>
        </div>
        {state.jobs.length === 0 ? (
          <p className="transcriptions-hint">{tt.capFeina}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{tt.colCanco}</th>
                <th>{tt.colMode}</th>
                <th>{tt.colEstat}</th>
                <th>{tt.colWorker}</th>
                <th>{tt.colIntents}</th>
                <th>{tt.colTemps}</th>
                <th>{tt.colAccions}</th>
              </tr>
            </thead>
            <tbody>
              {state.jobs.map((j) => (
                <Fragment key={j.id}>
                  <tr>
                    <td style={{ color: "var(--muted)" }}>{j.id}</td>
                    <td>
                      <a href={j.source_url} target="_blank" rel="noreferrer">
                        {j.title || tt.sensTitol}
                      </a>
                      {j.artist && <span style={{ color: "var(--muted)" }}> — {j.artist}</span>}
                      {j.error && (
                        <div className="transcriptions-error" title={j.error}>
                          {j.error}
                        </div>
                      )}
                      {j.status === "queued" && j.not_before && (
                        <div className="transcriptions-hint">{tt.reintentA(formatDate(j.not_before))}</div>
                      )}
                    </td>
                    <td>{j.mode === "new" ? tt.modeNew : tt.modeAnalyze}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[j.status]}`}>{tt.statusLabels[j.status]}</span>
                    </td>
                    <td style={{ fontSize: ".8rem" }}>{j.worker_name ?? "—"}</td>
                    <td style={{ textAlign: "center" }}>{j.attempts}</td>
                    <td style={{ fontSize: ".8rem" }}>{formatDuration(j.elapsed_seconds)}</td>
                    <td className="td-actions">
                      {(j.status === "done" || j.stats !== null) && (
                        <button className="btn-xs" onClick={() => toggleStats(j.id)}>
                          {openStats.has(j.id) ? tt.amagarDetalls : tt.detalls}
                        </button>
                      )}
                      {j.result_proposal_id !== null && j.status === "done" && (
                        <button
                          className="btn-xs"
                          onClick={() => router.push(`/app/editor?proposal=${j.result_proposal_id}`)}
                        >
                          {tt.revisar}
                        </button>
                      )}
                      {j.mode === "analyze" && j.song_id !== null && (
                        <button className="btn-xs" onClick={() => router.push(`/app/editor?id=${j.song_id}`)}>
                          {tt.obrir}
                        </button>
                      )}
                      {(j.status === "queued" || j.status === "running") && (
                        <button className="btn-xs danger" onClick={() => handleJobAction(j.id, "cancel")}>
                          {tt.cancellar}
                        </button>
                      )}
                      {(j.status === "failed" || j.status === "cancelled") && (
                        <button className="btn-xs" onClick={() => handleJobAction(j.id, "retry")}>
                          {tt.reintentar}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openStats.has(j.id) && (
                    <tr>
                      <td colSpan={8}>
                        <JobStatsView stats={j.stats} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {state.leaderboards && boards && (
        <section className="transcriptions-section">
          <div className="panel-toolbar">
            <h3>{tt.classificacionsTitol}</h3>
            {(["all", "month"] as const).map((p) => (
              <button key={p} className={`btn-xs ${period === p ? "success" : ""}`} onClick={() => setPeriod(p)}>
                {p === "all" ? tt.periodeSempre : tt.periodeMes}
              </button>
            ))}
          </div>
          <p className="transcriptions-hint">{tt.classificacionsHint(state.leaderboards.min_songs_speed)}</p>
          <div className="leaderboards">
            {(Object.keys(tt.classificacio) as LeaderboardKey[]).map((key) => (
              <div key={key} className="leaderboard">
                <h4>{tt.classificacio[key]}</h4>
                {boards[key].top.length === 0 ? (
                  <p className="transcriptions-hint">{tt.capClassificacio}</p>
                ) : (
                  <ol>
                    {boards[key].top.map((e) => (
                      <li key={e.worker_id}>
                        <span className={`leaderboard-rank leaderboard-rank-${e.rank}`}>{e.rank}</span>
                        <span className="leaderboard-name">{e.name}</span>
                        <span className="leaderboard-value">{formatLeaderboardValue(key, e.value)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="transcriptions-section">
        <h3>{tt.workersTitol}</h3>
        <p className="transcriptions-hint">{tt.workersHint}</p>
        <div className="panel-toolbar">
          <input
            type="text"
            placeholder={tt.nouWorkerPlaceholder}
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateWorker()}
            style={{ flex: "1 1 240px", maxWidth: 360 }}
          />
          <button className="btn-xs success" onClick={handleCreateWorker} disabled={!workerName.trim()}>
            {tt.crearWorker}
          </button>
        </div>
        {newToken && (
          <div className="transcriptions-token">
            <strong>{tt.tokenTitol(newToken.name)}</strong>
            <p className="transcriptions-hint">{tt.tokenHint}</p>
            <code>{newToken.token}</code>
            <div className="panel-toolbar">
              <button className="btn-xs success" onClick={() => copyToken(newToken.token)}>
                {tt.copiar}
              </button>
              <button className="btn-xs" onClick={() => setNewToken(null)}>
                {tt.tancar}
              </button>
            </div>
          </div>
        )}
        {state.workers.length === 0 ? (
          <p className="transcriptions-hint">{tt.capWorker}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{tt.colNom}</th>
                <th>{tt.colDispositiu}</th>
                <th>{tt.colVersio}</th>
                <th>{tt.colVist}</th>
                <th>{tt.colFetes}</th>
                <th>{tt.colMitjana}</th>
                <th>{tt.colAccions}</th>
              </tr>
            </thead>
            <tbody>
              {state.workers.map((w) => (
                <tr key={w.id} style={w.active ? undefined : { opacity: 0.5 }}>
                  <td>
                    {w.name}
                    {w.device_info?.hostname && (
                      <span style={{ color: "var(--muted)", fontSize: ".75rem" }}> ({w.device_info.hostname})</span>
                    )}
                  </td>
                  <td style={{ fontSize: ".8rem" }}>
                    {w.device_info
                      ? `${w.device_info.type.toUpperCase()} · ${w.device_info.name}${
                          w.device_info.vram_gb ? ` · ${w.device_info.vram_gb} GB` : ""
                        }`
                      : "—"}
                  </td>
                  <td style={{ fontSize: ".8rem" }}>{w.app_version ?? "—"}</td>
                  <td style={{ fontSize: ".8rem" }}>{w.last_seen_at ? formatDate(w.last_seen_at) : tt.mai}</td>
                  <td style={{ textAlign: "center" }}>{w.jobs_done}</td>
                  <td style={{ fontSize: ".8rem" }}>{formatDuration(w.avg_seconds)}</td>
                  <td className="td-actions">
                    <button
                      className={`btn-xs ${w.active ? "danger" : "success"}`}
                      onClick={() => handleWorker(w, "toggle")}
                    >
                      {w.active ? tt.desactivar : tt.activar}
                    </button>
                    <button className="btn-xs danger" onClick={() => handleWorker(w, "delete")}>
                      {tt.eliminar}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
