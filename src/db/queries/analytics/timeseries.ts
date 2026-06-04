import { sql } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { dailyStats, events, sessions } from "@/db/analyticsSchema"
import { categoryWhereClause } from "@/lib/analytics/pathCategory"

// ─── Tipus exportats ────────────────────────────────────────

export type TimeseriesPoint = { date: string; value: number }

// ─── Helpers privats ────────────────────────────────────────

// Itera tots els dies (UTC) entre from i to inclosos i retorna un array de YYYY-MM-DD.
function expandDateRange(from: string, to: string): string[] {
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
  const out: string[] = []
  for (let cur = f; cur <= t; cur += 86_400_000) {
    const d = new Date(cur)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

// Retorna la data UTC d'avui en format YYYY-MM-DD.
function todayUtc(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const d = String(now.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Calcula on-the-fly el valor d'una mètrica/dimensió per a un sol dia.
 * Només cobreix les mètriques més habituals; si la combinació no està
 * suportada, retorna null per indicar al cridador que no hi ha dada
 * (el dashboard pot mostrar "—" o ometre el punt).
 */
function computeMetricForDay(
  date: string,
  metric: string,
  dimension: string,
): number | null {
  if (metric === "page_views" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("c") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'page_view'`)
      .get()
    return row?.count ?? 0
  }

  // page_views_real exclou crides a l'API i recursos (img, _next).
  // Aquesta és la mètrica que mostrem a la gràfica del Resum: només
  // pàgines visitables reals (vegeu pathCategory.ts categoria "page").
  if (metric === "page_views_real" && dimension === "_total") {
    const where = categoryWhereClause("page")
    const stmt = analyticsDb.$client.prepare(`
      SELECT COUNT(*) AS c
      FROM events
      WHERE type = 'page_view'
        AND date(ts) = ?
        AND path IS NOT NULL
        AND ${where}
    `)
    const row = stmt.get(date) as { c: number } | undefined
    return row?.c ?? 0
  }

  if (metric === "unique_sessions" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(DISTINCT ${events.sessionId})`.as("c") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date}`)
      .get()
    return row?.count ?? 0
  }

  if (metric === "unique_sessions_human" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(DISTINCT ${events.sessionId})`.as("c") })
      .from(events)
      .innerJoin(sessions, sql`${sessions.sessionId} = ${events.sessionId}`)
      .where(sql`date(${events.ts}) = ${date} AND ${sessions.isBot} = 0`)
      .get()
    return row?.count ?? 0
  }

  if (metric === "bots_filtered" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("c") })
      .from(sessions)
      .where(sql`date(${sessions.firstSeen}) = ${date} AND ${sessions.isBot} = 1`)
      .get()
    return row?.count ?? 0
  }

  if (metric === "signins" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("c") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'signin_success'`)
      .get()
    return row?.count ?? 0
  }

  if (metric === "pdf_downloads" && dimension === "_total") {
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("c") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'pdf_download'`)
      .get()
    return row?.count ?? 0
  }

  if (metric === "events_by_type" && dimension.startsWith("type=")) {
    const type = dimension.slice("type=".length)
    const row = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("c") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = ${type}`)
      .get()
    return row?.count ?? 0
  }

  // Dimensió no suportada en càlcul on-the-fly.
  return null
}

// ─── API pública ────────────────────────────────────────────

/**
 * Retorna sèrie diària per a (metric, dimension) entre from i to.
 * Els dies passats es llegeixen de daily_stats; el dia d'avui es calcula
 * on-the-fly per a les mètriques principals. Els dies sense dada s'omplen
 * amb 0 per facilitar el render del gràfic.
 */
export async function getTimeseries(
  metric: string,
  dimension: string,
  from: string,
  to: string,
): Promise<TimeseriesPoint[]> {
  const rows = analyticsDb
    .select({ date: dailyStats.date, value: dailyStats.value })
    .from(dailyStats)
    .where(
      sql`${dailyStats.metric} = ${metric} AND ${dailyStats.dimension} = ${dimension} AND ${dailyStats.date} BETWEEN ${from} AND ${to}`,
    )
    .all()

  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date, r.value)

  const today = todayUtc()
  // Si avui (o algun dia futur dins el rang) no és a daily_stats, intenta
  // calcular-lo en directe. Només considerem "avui" — els dies passats
  // sense fila a daily_stats es deixen a 0.
  if (!byDate.has(today)) {
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
    const todayMs = Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)),
    )
    if (todayMs >= f && todayMs <= t) {
      const computed = computeMetricForDay(today, metric, dimension)
      if (computed !== null) byDate.set(today, computed)
    }
  }

  return expandDateRange(from, to).map((date) => ({
    date,
    value: byDate.get(date) ?? 0,
  }))
}
