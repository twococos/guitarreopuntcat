"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getT } from "@/lib/i18n"
import { TimeseriesChart } from "./TimeseriesChart"
import { DistributionChart, type DistributionSeries } from "./DistributionChart"

// ─── Tipus de la API ───────────────────────────────────────────

type SummaryKpis = {
  page_views: number
  unique_sessions: number
  bots_filtered: number
  signins: number
  pdf_downloads: number
  page_engagement_avg_ms: number
  trend: { page_views_pct: number; unique_sessions_pct: number }
}

type TimeseriesPoint = { date: string; value: number }

type TopPageRow = {
  path: string
  views: number
  avg_engagement_ms: number | null
}
type CategoryAggregate = {
  category: string
  total_views: number
  unique_paths: number
  avg_views_per_path: number
  total_engagement_events: number
  avg_engagement_ms: number | null
}
type SongOrArtistRow = {
  slug: string
  artist_slug: string
  song_slug: string | null
  title: string
  artist: string | null
  views: number
  pct_of_total: number
}
type CategoryTimeseriesRow = {
  path: string
  date: string
  value: number
  total_for_day: number
}
type TopSearchRow = { q: string; count: number; avg_results: number }
type ZeroResultSearch = { q: string; count: number }
type GeoRow = { country: string; sessions: number }
type SuspiciousIpRow = {
  ip_hash: string
  bucket_minute: string
  count: number
  country: string | null
  last_ip_raw: string | null
  blocked: boolean
}
type BlockedIpRow = {
  id: number
  ip_hash: string
  reason: string | null
  blocked_at: string
  blocked_by: number | null
  expires_at: string | null
}

type SubTab = "summary" | "pages" | "searches" | "geo" | "suspicious"
type RangeKey = "7" | "30" | "90"

// ─── Utilitats ─────────────────────────────────────────────────

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoUtc(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function rangeToParams(range: RangeKey): { from: string; to: string } {
  const days = Number(range)
  return { from: daysAgoUtc(days - 1), to: todayIsoUtc() }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

// ─── Component principal ───────────────────────────────────────

export function AnalyticsPanel() {
  const t = getT()
  const [subTab, setSubTab] = useState<SubTab>("summary")
  const [range, setRange] = useState<RangeKey>("30")

  return (
    <div id="analytics-panel">
      <div className="analytics-controls">
        <div className="analytics-subtabs">
          <button
            className={`tab-sub ${subTab === "summary" ? "active" : ""}`}
            onClick={() => setSubTab("summary")}
          >
            {t.analytics.tabs.summary}
          </button>
          <button
            className={`tab-sub ${subTab === "pages" ? "active" : ""}`}
            onClick={() => setSubTab("pages")}
          >
            {t.analytics.tabs.pages}
          </button>
          <button
            className={`tab-sub ${subTab === "searches" ? "active" : ""}`}
            onClick={() => setSubTab("searches")}
          >
            {t.analytics.tabs.searches}
          </button>
          <button
            className={`tab-sub ${subTab === "geo" ? "active" : ""}`}
            onClick={() => setSubTab("geo")}
          >
            {t.analytics.tabs.geo}
          </button>
          <button
            className={`tab-sub ${subTab === "suspicious" ? "active" : ""}`}
            onClick={() => setSubTab("suspicious")}
          >
            {t.analytics.tabs.suspicious}
          </button>
        </div>

        <label className="analytics-range">
          <span className="muted">{t.analytics.range.label}:</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
          >
            <option value="7">{t.analytics.range.last7}</option>
            <option value="30">{t.analytics.range.last30}</option>
            <option value="90">{t.analytics.range.last90}</option>
          </select>
        </label>
      </div>

      <div className="analytics-content">
        {subTab === "summary" && <SummaryTab range={range} />}
        {subTab === "pages" && <PagesTab range={range} />}
        {subTab === "searches" && <SearchesTab range={range} />}
        {subTab === "geo" && <GeoTab range={range} />}
        {subTab === "suspicious" && <SuspiciousTab />}
      </div>
    </div>
  )
}

// ─── Sub-pestanya: Resum ───────────────────────────────────────

function SummaryTab({ range }: { range: RangeKey }) {
  const t = getT()
  const [kpis, setKpis] = useState<SummaryKpis | null>(null)
  const [views, setViews] = useState<TimeseriesPoint[]>([])
  const [sessions, setSessions] = useState<TimeseriesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const params = useMemo(() => rangeToParams(range), [range])

  useEffect(() => {
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ from: params.from, to: params.to })
    Promise.all([
      fetch(`/api/admin/analytics/summary?${qs}`).then((r) => r.json()),
      fetch(
        `/api/admin/analytics/timeseries?metric=page_views_real&dimension=_total&${qs}`,
      ).then((r) => r.json()),
      fetch(
        `/api/admin/analytics/timeseries?metric=unique_sessions_human&dimension=_total&${qs}`,
      ).then((r) => r.json()),
    ])
      .then(([s, v, u]) => {
        setKpis(s as SummaryKpis)
        setViews((v as { points: TimeseriesPoint[] }).points)
        setSessions((u as { points: TimeseriesPoint[] }).points)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [params.from, params.to])

  if (loading) return <p className="muted">{t.analytics.loading}</p>
  if (error || !kpis) return <p className="error">{t.analytics.errors.loadFailed}</p>

  return (
    <>
      <div id="stats-grid" className="analytics-stats">
        <KpiCard
          label={t.analytics.metrics.pageViews}
          value={kpis.page_views}
          trend={kpis.trend.page_views_pct}
        />
        <KpiCard
          label={t.analytics.metrics.uniqueSessions}
          value={kpis.unique_sessions}
          trend={kpis.trend.unique_sessions_pct}
        />
        <KpiCard
          label={t.analytics.metrics.botsFiltered}
          value={kpis.bots_filtered}
        />
        <KpiCard
          label={t.analytics.metrics.signins}
          value={kpis.signins}
        />
        <KpiCard
          label={t.analytics.metrics.pdfDownloads}
          value={kpis.pdf_downloads}
        />
        <KpiCard
          label={t.analytics.metrics.avgEngagement}
          value={formatMs(kpis.page_engagement_avg_ms)}
        />
      </div>

      <section className="analytics-chart-block">
        <h3>{t.analytics.charts.pageViews}</h3>
        <TimeseriesChart
          points={views}
          label={t.analytics.metrics.pageViews}
        />
      </section>

      <section className="analytics-chart-block">
        <h3>{t.analytics.charts.uniqueSessions}</h3>
        <TimeseriesChart
          points={sessions}
          label={t.analytics.metrics.uniqueSessions}
          color="#0ea884"
        />
      </section>
    </>
  )
}

function KpiCard({
  label,
  value,
  trend,
}: {
  label: string
  value: number | string
  trend?: number
}) {
  const t = getT()
  let trendNode: React.ReactNode = null
  if (trend !== undefined) {
    if (trend === 0) {
      trendNode = <span className="trend flat">{t.analytics.trend.flat}</span>
    } else if (trend > 0) {
      trendNode = <span className="trend up">{t.analytics.trend.up(trend)}</span>
    } else {
      trendNode = <span className="trend down">{t.analytics.trend.down(trend)}</span>
    }
  }
  return (
    <div className="stat-card">
      <div className="stat-num">{value}</div>
      <div className="stat-label">{label}</div>
      {trendNode}
    </div>
  )
}

// ─── Sub-pestanya: Pàgines ─────────────────────────────────────

type PagesSubtab = "all" | "public" | "app" | "songs" | "artists" | "api"

function PagesTab({ range }: { range: RangeKey }) {
  const t = getT()
  const [subtab, setSubtab] = useState<PagesSubtab>("all")

  return (
    <>
      <div className="analytics-subtabs analytics-subtabs-nested">
        <button
          className={`tab-sub ${subtab === "all" ? "active" : ""}`}
          onClick={() => setSubtab("all")}
        >
          {t.analytics.pages.subtabs.all}
        </button>
        <button
          className={`tab-sub ${subtab === "public" ? "active" : ""}`}
          onClick={() => setSubtab("public")}
        >
          {t.analytics.pages.subtabs.public}
        </button>
        <button
          className={`tab-sub ${subtab === "app" ? "active" : ""}`}
          onClick={() => setSubtab("app")}
        >
          {t.analytics.pages.subtabs.app}
        </button>
        <button
          className={`tab-sub ${subtab === "songs" ? "active" : ""}`}
          onClick={() => setSubtab("songs")}
        >
          {t.analytics.pages.subtabs.songs}
        </button>
        <button
          className={`tab-sub ${subtab === "artists" ? "active" : ""}`}
          onClick={() => setSubtab("artists")}
        >
          {t.analytics.pages.subtabs.artists}
        </button>
        <button
          className={`tab-sub ${subtab === "api" ? "active" : ""}`}
          onClick={() => setSubtab("api")}
        >
          {t.analytics.pages.subtabs.api}
        </button>
      </div>

      {subtab === "all" && <CategoryPagesView range={range} category="page" />}
      {subtab === "public" && <CategoryPagesView range={range} category="public" />}
      {subtab === "app" && <CategoryPagesView range={range} category="app" />}
      {subtab === "songs" && <SongsArtistsView range={range} kind="song" />}
      {subtab === "artists" && <SongsArtistsView range={range} kind="artist" />}
      {subtab === "api" && <CategoryPagesView range={range} category="api" hideEngagement />}
    </>
  )
}

function formatEngagement(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function CategoryPagesView({
  range,
  category,
  hideEngagement = false,
}: {
  range: RangeKey
  category: "page" | "public" | "app" | "api"
  hideEngagement?: boolean
}) {
  const t = getT()
  const [data, setData] = useState<{
    pages: TopPageRow[]
    aggregate: CategoryAggregate
  } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null)
    setError(false)
    const { from, to } = rangeToParams(range)
    fetch(
      `/api/admin/analytics/pages?category=${category}&from=${from}&to=${to}&limit=100`,
    )
      .then((r) => r.json())
      .then((d: { pages: TopPageRow[]; aggregate: CategoryAggregate }) => setData(d))
      .catch(() => setError(true))
  }, [range, category])

  if (error) return <p className="error">{t.analytics.errors.loadFailed}</p>
  if (data === null) return <p className="muted">{t.analytics.loading}</p>

  return (
    <>
      <div id="stats-grid" className="analytics-stats">
        <KpiCard
          label={t.analytics.pages.aggregate.totalViews}
          value={data.aggregate.total_views}
        />
        <KpiCard
          label={t.analytics.pages.aggregate.uniquePaths}
          value={data.aggregate.unique_paths}
        />
        <KpiCard
          label={t.analytics.pages.aggregate.avgViewsPerPath}
          value={data.aggregate.avg_views_per_path}
        />
        {!hideEngagement && (
          <KpiCard
            label={t.analytics.pages.aggregate.avgEngagement}
            value={formatEngagement(data.aggregate.avg_engagement_ms)}
          />
        )}
      </div>

      {data.pages.length === 0 ? (
        <p className="muted">{t.analytics.pages.empty}</p>
      ) : (
        <section className="analytics-table-block">
          <h3>{t.analytics.pages.title}</h3>
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t.analytics.pages.colPath}</th>
                <th className="num">{t.analytics.pages.colViews}</th>
                {!hideEngagement && (
                  <th className="num">{t.analytics.pages.colAvgEngagement}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.pages.map((r) => (
                <tr key={r.path}>
                  <td><code>{r.path}</code></td>
                  <td className="num">{r.views}</td>
                  {!hideEngagement && (
                    <td className="num">{formatEngagement(r.avg_engagement_ms)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

const DISTRIBUTION_COLORS = [
  "#4f8df1",
  "#0ea884",
  "#e07a3c",
  "#a06cd5",
  "#e25c8b",
  "#0bb8c9",
  "#c9a227",
  "#7b8d99",
]

function SongsArtistsView({
  range,
  kind,
}: {
  range: RangeKey
  kind: "song" | "artist"
}) {
  const t = getT()
  const [data, setData] = useState<{
    rows: SongOrArtistRow[]
    aggregate: CategoryAggregate
    timeseries: CategoryTimeseriesRow[]
  } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null)
    setError(false)
    const { from, to } = rangeToParams(range)
    const endpoint = kind === "song" ? "songs" : "artists"
    fetch(`/api/admin/analytics/${endpoint}?from=${from}&to=${to}&limit=20`)
      .then((r) => r.json())
      .then((d: {
        songs?: SongOrArtistRow[]
        artists?: SongOrArtistRow[]
        aggregate: CategoryAggregate
        timeseries: CategoryTimeseriesRow[]
      }) => {
        const rows = (kind === "song" ? d.songs : d.artists) ?? []
        setData({ rows, aggregate: d.aggregate, timeseries: d.timeseries })
      })
      .catch(() => setError(true))
  }, [range, kind])

  const series: DistributionSeries[] = useMemo(() => {
    if (!data) return []
    // Agafa els primers 8 paths del top com a línies
    const topRows = data.rows.slice(0, 8)
    return topRows.map((row, i) => {
      const targetPath =
        kind === "song"
          ? `/songs/${row.artist_slug}/${row.song_slug}`
          : `/songs/${row.artist_slug}`
      const points = data.timeseries
        .filter((p) => p.path === targetPath)
        .map((p) => ({
          date: p.date,
          pct:
            p.total_for_day === 0
              ? 0
              : Math.round((p.value / p.total_for_day) * 1000) / 10,
        }))
      return {
        key: targetPath,
        label: kind === "song" && row.artist ? `${row.title} — ${row.artist}` : row.title,
        color: DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length],
        points,
      }
    })
  }, [data, kind])

  if (error) return <p className="error">{t.analytics.errors.loadFailed}</p>
  if (data === null) return <p className="muted">{t.analytics.loading}</p>

  const title =
    kind === "song" ? t.analytics.pages.songsTitle : t.analytics.pages.artistsTitle

  return (
    <>
      <div id="stats-grid" className="analytics-stats">
        <KpiCard
          label={t.analytics.pages.aggregate.totalViews}
          value={data.aggregate.total_views}
        />
        <KpiCard
          label={t.analytics.pages.aggregate.uniquePaths}
          value={data.aggregate.unique_paths}
        />
        <KpiCard
          label={t.analytics.pages.aggregate.avgViewsPerPath}
          value={data.aggregate.avg_views_per_path}
        />
        <KpiCard
          label={t.analytics.pages.aggregate.avgEngagement}
          value={formatEngagement(data.aggregate.avg_engagement_ms)}
        />
      </div>

      {data.rows.length === 0 ? (
        <p className="muted">{t.analytics.pages.empty}</p>
      ) : (
        <>
          <section className="analytics-table-block">
            <h3>{title}</h3>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>{t.analytics.pages.colTitle}</th>
                  {kind === "song" && <th>{t.analytics.pages.colArtist}</th>}
                  <th className="num">{t.analytics.pages.colViews}</th>
                  <th className="num">{t.analytics.pages.colPct}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.slug}>
                    <td>{r.title}</td>
                    {kind === "song" && <td>{r.artist ?? "—"}</td>}
                    <td className="num">{r.views}</td>
                    <td className="num">{r.pct_of_total}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="analytics-chart-block">
            <h3>{t.analytics.pages.distribution}</h3>
            <DistributionChart series={series} />
          </section>
        </>
      )}
    </>
  )
}

// ─── Sub-pestanya: Cerques ─────────────────────────────────────

function SearchesTab({ range }: { range: RangeKey }) {
  const t = getT()
  const [data, setData] = useState<{ top: TopSearchRow[]; zero_results: ZeroResultSearch[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setData(null)
    setError(false)
    const { from, to } = rangeToParams(range)
    fetch(`/api/admin/analytics/searches?from=${from}&to=${to}&limit=50`)
      .then((r) => r.json())
      .then((d: { top: TopSearchRow[]; zero_results: ZeroResultSearch[] }) => setData(d))
      .catch(() => setError(true))
  }, [range])

  if (error) return <p className="error">{t.analytics.errors.loadFailed}</p>
  if (data === null) return <p className="muted">{t.analytics.loading}</p>

  return (
    <>
      <section className="analytics-table-block">
        <h3>{t.analytics.searches.topTitle}</h3>
        {data.top.length === 0 ? (
          <p className="muted">{t.analytics.searches.emptyTop}</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t.analytics.searches.colQuery}</th>
                <th className="num">{t.analytics.searches.colCount}</th>
                <th className="num">{t.analytics.searches.colAvgResults}</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((r) => (
                <tr key={r.q}>
                  <td>{r.q}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.avg_results}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="analytics-table-block">
        <h3>{t.analytics.searches.zeroTitle}</h3>
        {data.zero_results.length === 0 ? (
          <p className="muted">{t.analytics.searches.emptyZero}</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t.analytics.searches.colQuery}</th>
                <th className="num">{t.analytics.searches.colCount}</th>
              </tr>
            </thead>
            <tbody>
              {data.zero_results.map((r) => (
                <tr key={r.q}>
                  <td>{r.q}</td>
                  <td className="num">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

// ─── Sub-pestanya: Geografia ───────────────────────────────────

function GeoTab({ range }: { range: RangeKey }) {
  const t = getT()
  const [rows, setRows] = useState<GeoRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setRows(null)
    setError(false)
    const { from, to } = rangeToParams(range)
    fetch(`/api/admin/analytics/geo?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d: { countries: GeoRow[] }) => setRows(d.countries))
      .catch(() => setError(true))
  }, [range])

  if (error) return <p className="error">{t.analytics.errors.loadFailed}</p>
  if (rows === null) return <p className="muted">{t.analytics.loading}</p>
  if (rows.length === 0) return <p className="muted">{t.analytics.geo.empty}</p>

  const total = rows.reduce((s, r) => s + r.sessions, 0)
  return (
    <section className="analytics-table-block">
      <h3>{t.analytics.geo.title}</h3>
      <table className="analytics-table">
        <thead>
          <tr>
            <th>{t.analytics.geo.colCountry}</th>
            <th className="num">{t.analytics.geo.colSessions}</th>
            <th className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.sessions / total) * 100) : 0
            return (
              <tr key={r.country}>
                <td>{r.country}</td>
                <td className="num">{r.sessions}</td>
                <td className="num">{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ─── Sub-pestanya: Sospitosos ─────────────────────────────────

function SuspiciousTab() {
  const t = getT()
  const [data, setData] = useState<{
    suspicious: SuspiciousIpRow[]
    blocked: BlockedIpRow[]
  } | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    fetch("/api/admin/analytics/ips?limit=100")
      .then((r) => r.json())
      .then((d: { suspicious: SuspiciousIpRow[]; blocked: BlockedIpRow[] }) => setData(d))
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleBlock = useCallback(
    async (ipHash: string) => {
      if (!confirm(t.analytics.suspicious.confirmBlock)) return
      const reason = window.prompt(t.analytics.suspicious.blockReasonPrompt) ?? ""
      try {
        const res = await fetch("/api/admin/analytics/block", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ip_hash: ipHash, reason: reason || null }),
        })
        if (!res.ok) throw new Error("block failed")
        load()
      } catch {
        alert(t.analytics.errors.blockFailed)
      }
    },
    [load, t],
  )

  const handleUnblock = useCallback(
    async (ipHash: string) => {
      if (!confirm(t.analytics.suspicious.confirmUnblock)) return
      try {
        const res = await fetch("/api/admin/analytics/block", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ip_hash: ipHash }),
        })
        if (!res.ok) throw new Error("unblock failed")
        load()
      } catch {
        alert(t.analytics.errors.unblockFailed)
      }
    },
    [load, t],
  )

  if (error) return <p className="error">{t.analytics.errors.loadFailed}</p>
  if (data === null) return <p className="muted">{t.analytics.loading}</p>

  return (
    <>
      <section className="analytics-table-block">
        <h3>{t.analytics.suspicious.title}</h3>
        <p className="muted">{t.analytics.suspicious.description}</p>
        {data.suspicious.length === 0 ? (
          <p className="muted">{t.analytics.suspicious.emptySuspicious}</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t.analytics.suspicious.colHash}</th>
                <th>{t.analytics.suspicious.colMinute}</th>
                <th className="num">{t.analytics.suspicious.colCount}</th>
                <th>{t.analytics.suspicious.colCountry}</th>
                <th>{t.analytics.suspicious.colIp}</th>
                <th>{t.analytics.suspicious.colStatus}</th>
                <th>{t.analytics.suspicious.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {data.suspicious.map((r) => (
                <tr key={`${r.ip_hash}-${r.bucket_minute}`}>
                  <td><code>{r.ip_hash.slice(0, 12)}…</code></td>
                  <td>{r.bucket_minute}</td>
                  <td className="num">{r.count}</td>
                  <td>{r.country ?? "—"}</td>
                  <td><code>{r.last_ip_raw ?? t.analytics.suspicious.ipHidden}</code></td>
                  <td>
                    {r.blocked ? (
                      <span className="badge danger">{t.analytics.suspicious.blocked}</span>
                    ) : (
                      <span className="badge">{t.analytics.suspicious.notBlocked}</span>
                    )}
                  </td>
                  <td>
                    {r.blocked ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => handleUnblock(r.ip_hash)}
                      >
                        {t.analytics.suspicious.unblock}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => handleBlock(r.ip_hash)}
                      >
                        {t.analytics.suspicious.block}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="analytics-table-block">
        <h3>{t.analytics.suspicious.blockedTitle}</h3>
        {data.blocked.length === 0 ? (
          <p className="muted">{t.analytics.suspicious.emptyBlocked}</p>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>{t.analytics.suspicious.colHash}</th>
                <th>Motiu</th>
                <th>Des de</th>
                <th>{t.analytics.suspicious.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {data.blocked.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.ip_hash.slice(0, 12)}…</code></td>
                  <td>{r.reason ?? "—"}</td>
                  <td>{r.blocked_at}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => handleUnblock(r.ip_hash)}
                    >
                      {t.analytics.suspicious.unblock}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
