import { sql } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { events, sessions } from "@/db/analyticsSchema"
import { categoryWhereClause } from "@/lib/analytics/pathCategory"

// ─── Tipus exportats ────────────────────────────────────────

export type SummaryKpis = {
  page_views: number
  unique_sessions: number
  bots_filtered: number
  signins: number
  pdf_downloads: number
  page_engagement_avg_ms: number
  trend: {
    page_views_pct: number
    unique_sessions_pct: number
  }
}

// ─── Helpers privats ────────────────────────────────────────

// Calcula el nombre de dies inclosos entre dues dates (YYYY-MM-DD) UTC.
function daysBetween(from: string, to: string): number {
  const f = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  )
  const t = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  )
  const diff = Math.round((t - f) / 86_400_000) + 1
  return diff > 0 ? diff : 1
}

// Resta `days` dies a una data YYYY-MM-DD i retorna en el mateix format.
function shiftDate(date: string, days: number): string {
  const t = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  const d = new Date(t + days * 86_400_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Calcula la variació percentual entre curr i prev seguint la regla acordada.
function pctChange(curr: number, prev: number): number {
  if (prev === 0 && curr === 0) return 0
  if (prev === 0 && curr > 0) return 999
  return Math.round(((curr - prev) / prev) * 100)
}

// Helpers que calculen cada KPI per a un interval [from, to].

async function countPageViews(from: string, to: string): Promise<number> {
  // Filtrem només pàgines reals: exclou /api/* i recursos (categoria "page").
  const where = categoryWhereClause("page")
  const stmt = analyticsDb.$client.prepare(`
    SELECT COUNT(*) AS c
    FROM events
    WHERE type = 'page_view'
      AND date(ts) BETWEEN ? AND ?
      AND path IS NOT NULL
      AND ${where}
  `)
  const row = stmt.get(from, to) as { c: number } | undefined
  return row?.c ?? 0
}

async function countUniqueSessions(from: string, to: string): Promise<number> {
  const row = analyticsDb
    .select({ count: sql<number>`COUNT(DISTINCT ${events.sessionId})`.as("c") })
    .from(events)
    .innerJoin(sessions, sql`${sessions.sessionId} = ${events.sessionId}`)
    .where(
      sql`${sessions.isBot} = 0 AND date(${events.ts}) BETWEEN ${from} AND ${to}`,
    )
    .get()
  return row?.count ?? 0
}

async function countBotsFiltered(from: string, to: string): Promise<number> {
  const row = analyticsDb
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(sessions)
    .where(
      sql`${sessions.isBot} = 1 AND date(${sessions.firstSeen}) BETWEEN ${from} AND ${to}`,
    )
    .get()
  return row?.count ?? 0
}

async function countSignins(from: string, to: string): Promise<number> {
  const row = analyticsDb
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(events)
    .where(
      sql`${events.type} = 'signin_success' AND date(${events.ts}) BETWEEN ${from} AND ${to}`,
    )
    .get()
  return row?.count ?? 0
}

async function countPdfDownloads(from: string, to: string): Promise<number> {
  const row = analyticsDb
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(events)
    .where(
      sql`${events.type} = 'pdf_download' AND date(${events.ts}) BETWEEN ${from} AND ${to}`,
    )
    .get()
  return row?.count ?? 0
}

async function avgPageEngagementMs(from: string, to: string): Promise<number> {
  // json_extract retorna NUMERIC; AVG ignora NULLs.
  const row = analyticsDb
    .select({
      avg: sql<number | null>`AVG(json_extract(${events.metadata}, '$.active_ms'))`.as(
        "avg",
      ),
    })
    .from(events)
    .where(
      sql`${events.type} = 'page_engagement' AND date(${events.ts}) BETWEEN ${from} AND ${to}`,
    )
    .get()
  const avg = row?.avg
  return avg == null ? 0 : Math.round(avg)
}

// ─── API pública ────────────────────────────────────────────

/**
 * Calcula KPIs per a un període arbitrari [from, to] (YYYY-MM-DD UTC, inclosos).
 * Va directament a `events`/`sessions` per cobrir també el dia actual,
 * que pot no estar agregat encara a daily_stats.
 */
export async function getSummaryKpis(from: string, to: string): Promise<SummaryKpis> {
  const span = daysBetween(from, to)
  const prevTo = shiftDate(from, -1)
  const prevFrom = shiftDate(prevTo, -(span - 1))

  const [
    pageViews,
    uniqueSessions,
    botsFiltered,
    signins,
    pdfDownloads,
    engagementAvg,
    prevPageViews,
    prevUniqueSessions,
  ] = await Promise.all([
    countPageViews(from, to),
    countUniqueSessions(from, to),
    countBotsFiltered(from, to),
    countSignins(from, to),
    countPdfDownloads(from, to),
    avgPageEngagementMs(from, to),
    countPageViews(prevFrom, prevTo),
    countUniqueSessions(prevFrom, prevTo),
  ])

  return {
    page_views: pageViews,
    unique_sessions: uniqueSessions,
    bots_filtered: botsFiltered,
    signins,
    pdf_downloads: pdfDownloads,
    page_engagement_avg_ms: engagementAvg,
    trend: {
      page_views_pct: pctChange(pageViews, prevPageViews),
      unique_sessions_pct: pctChange(uniqueSessions, prevUniqueSessions),
    },
  }
}
