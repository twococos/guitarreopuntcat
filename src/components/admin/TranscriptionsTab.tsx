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
  spotify_url: string | null
  status: JobStatus
  worker_name: string | null
  attempts: number
  not_before: string | null
  error: string | null
  result_song_id: number | null
  result_proposal_id: number | null
  elapsed_seconds: number | null
  stats: Record<string, unknown> | null
  created_at: string | null
  finished_at: string | null
}

interface QueueRow extends JobRow {
  /** Ordre de sortida (null: ja és en curs). */
  position: number | null
  deferred: boolean
}

type QueueOrder = "fifo" | "lifo"
type FinishedStatus = "done" | "failed" | "cancelled"

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
  queue: QueueRow[]
  queue_order: QueueOrder
  counts: Partial<Record<JobStatus, number>>
  workers: WorkerRow[]
  leaderboards: Leaderboards | null
}

const REFRESH_MS = 10_000
const FINISHED_PAGE = 50
const FINISHED_MAX = 500

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

export function TranscriptionsTab() {
  const t = getT()
  const tt = t.admin.transcriptionsTab
  const router = useRouter()
  const toast = useToastStore.getState().show
  const [state, setState] = useState<QueueState>({
    queue: [],
    queue_order: "fifo",
    counts: {},
    workers: [],
    leaderboards: null,
  })
  const [finished, setFinished] = useState<JobRow[]>([])
  const [finishedStatus, setFinishedStatus] = useState<FinishedStatus | null>(null)
  const [finishedWorker, setFinishedWorker] = useState<number | null>(null)
  const [finishedLimit, setFinishedLimit] = useState(FINISHED_PAGE)
  const [openStats, setOpenStats] = useState<Set<number>>(new Set())
  const [period, setPeriod] = useState<"all" | "month">("all")
  const [workerName, setWorkerName] = useState("")
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(finishedLimit) })
    if (finishedStatus) params.set("status", finishedStatus)
    if (finishedWorker) params.set("worker", String(finishedWorker))
    const [queueRes, finishedRes] = await Promise.all([
      fetch("/api/admin/transcriptions"),
      fetch(`/api/admin/transcriptions/finished?${params}`),
    ])
    if (queueRes.ok) setState((await queueRes.json()) as QueueState)
    if (finishedRes.ok) setFinished(((await finishedRes.json()) as { jobs: JobRow[] }).jobs)
  }, [finishedLimit, finishedStatus, finishedWorker])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  async function patchQueue(body: unknown): Promise<unknown> {
    const res = await fetch("/api/admin/transcriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast(t.admin.toasts.errorAccio, { type: "error" })
      return null
    }
    return (await res.json()) as unknown
  }

  async function handleQueueOrder(order: QueueOrder) {
    if (order === state.queue_order) return
    setState((s) => ({ ...s, queue_order: order }))
    await patchQueue({ queue_order: order })
    load()
  }

  async function handleCancelQueued() {
    const n = state.queue.filter((j) => j.status === "queued").length
    if (n === 0 || !confirm(tt.confirmCancellaCua(n))) return
    const data = (await patchQueue({ cancel_queued: true })) as { cancelled: number } | null
    if (data) toast(tt.cuaCancellada(data.cancelled), { type: "success" })
    load()
  }

  async function handleJobAction(id: number, action: "cancel" | "retry" | "top") {
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

  /** Títol (enllaç al vídeo), artista, Spotify i error. */
  function songCell(j: JobRow) {
    return (
      <td>
        <a href={j.source_url} target="_blank" rel="noreferrer">
          {j.title || tt.sensTitol}
        </a>
        {j.artist && <span style={{ color: "var(--muted)" }}> — {j.artist}</span>}
        {j.spotify_url && (
          <a className="queue-spotify" href={j.spotify_url} target="_blank" rel="noreferrer">
            {tt.spotify}
          </a>
        )}
        {j.error && (
          <div className="transcriptions-error" title={j.error}>
            {j.error}
          </div>
        )}
      </td>
    )
  }

  const statuses: JobStatus[] = ["queued", "running", "done", "failed", "cancelled"]
  const finishedStatuses: FinishedStatus[] = ["done", "failed", "cancelled"]
  const boards = state.leaderboards?.periods[period]
  const queuedCount = state.queue.filter((j) => j.status === "queued").length
  const firstQueuedId = state.queue.find((j) => j.position === 1)?.id

  return (
    <div className="transcriptions-tab">
      <section className="transcriptions-section">
        <div className="panel-toolbar">
          <h3>{tt.cuaTitol(state.queue.length)}</h3>
          <div className="queue-order" role="group" aria-label={tt.ordre}>
            {(["fifo", "lifo"] as const).map((o) => (
              <button
                key={o}
                className={`btn-xs ${state.queue_order === o ? "success" : ""}`}
                onClick={() => handleQueueOrder(o)}
                title={o === "fifo" ? tt.fifoTitle : tt.lifoTitle}
                aria-pressed={state.queue_order === o}
              >
                {o === "fifo" ? tt.fifo : tt.lifo}
              </button>
            ))}
          </div>
          {statuses.map((s) => (
            <span key={s} className={`badge ${STATUS_BADGE[s]}`}>
              {tt.statusLabels[s]}: {state.counts[s] ?? 0}
            </span>
          ))}
          <button className="btn-xs" onClick={load}>
            {tt.actualitzar}
          </button>
          <button className="btn-xs danger" onClick={handleCancelQueued} disabled={queuedCount === 0}>
            {tt.cancellaCua}
          </button>
        </div>
        {state.queue.length === 0 ? (
          <p className="transcriptions-hint">{tt.capFeinaCua}</p>
        ) : (
          <table className="queue-table">
            <thead>
              <tr>
                <th>{tt.colPosicio}</th>
                <th>{tt.colCanco}</th>
                <th>{tt.colMode}</th>
                <th>{tt.colEstat}</th>
                <th>{tt.colWorker}</th>
                <th>{tt.colIntents}</th>
                <th>{tt.colEntrada}</th>
                <th>{tt.colAccions}</th>
              </tr>
            </thead>
            <tbody>
              {state.queue.map((j) => (
                <tr key={j.id} className={j.status === "running" ? "queue-running" : j.deferred ? "queue-deferred" : ""}>
                  <td className="queue-position">{j.position ?? "▶"}</td>
                  {songCell(j)}
                  <td>{j.mode === "new" ? tt.modeNew : tt.modeAnalyze}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[j.status]}`}>{tt.statusLabels[j.status]}</span>
                    {j.deferred && j.not_before && (
                      <div className="transcriptions-hint">{tt.ajornada(formatDate(j.not_before))}</div>
                    )}
                  </td>
                  <td style={{ fontSize: ".8rem" }}>{j.worker_name ?? "—"}</td>
                  <td style={{ textAlign: "center" }}>{j.attempts}</td>
                  <td style={{ fontSize: ".8rem" }}>{formatDate(j.created_at)}</td>
                  <td className="td-actions">
                    {j.status === "queued" && j.id !== firstQueuedId && (
                      <button className="btn-xs" onClick={() => handleJobAction(j.id, "top")} title={tt.processaAraTitle}>
                        {tt.processaAra}
                      </button>
                    )}
                    {j.mode === "analyze" && j.song_id !== null && (
                      <button className="btn-xs" onClick={() => router.push(`/app/editor?id=${j.song_id}`)}>
                        {tt.obrir}
                      </button>
                    )}
                    <button className="btn-xs danger" onClick={() => handleJobAction(j.id, "cancel")}>
                      {tt.cancellar}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="transcriptions-section">
        <div className="panel-toolbar">
          <h3>{tt.processadesTitol}</h3>
          <button
            className={`btn-xs ${finishedStatus === null ? "success" : ""}`}
            onClick={() => setFinishedStatus(null)}
          >
            {tt.filtreTotes}
          </button>
          {finishedStatuses.map((s) => (
            <button
              key={s}
              className={`btn-xs ${finishedStatus === s ? "success" : ""}`}
              onClick={() => setFinishedStatus(s)}
            >
              {tt.statusLabels[s]} ({state.counts[s] ?? 0})
            </button>
          ))}
          <select
            value={finishedWorker ?? ""}
            onChange={(e) => setFinishedWorker(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{tt.filtreWorker}</option>
            {state.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {finished.length === 0 ? (
          <p className="transcriptions-hint">{tt.capFeinaProcessada}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{tt.colAcabada}</th>
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
              {finished.map((j) => (
                <Fragment key={j.id}>
                  <tr>
                    <td style={{ fontSize: ".8rem" }}>{formatDate(j.finished_at)}</td>
                    {songCell(j)}
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
        {finished.length >= finishedLimit && finishedLimit < FINISHED_MAX && (
          <div className="panel-toolbar queue-more">
            <button className="btn-xs" onClick={() => setFinishedLimit((n) => Math.min(n + FINISHED_PAGE, FINISHED_MAX))}>
              {tt.carregaMes}
            </button>
          </div>
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
