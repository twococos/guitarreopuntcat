import { analyticsDb } from "@/db/analyticsClient"
import { dailyStats, events, sessions } from "@/db/analyticsSchema"
import { eq, sql } from "drizzle-orm"
import { categoryWhereClause } from "./pathCategory"

export type AggregateResult = { date: string; rowsWritten: number }

// Funció auxiliar per inserir o actualitzar una fila a daily_stats (idempotent)
function upsertStat(date: string, metric: string, dimension: string, value: number): void {
  analyticsDb
    .insert(dailyStats)
    .values({ date, metric, dimension, value })
    .onConflictDoUpdate({
      target: [dailyStats.date, dailyStats.metric, dailyStats.dimension],
      set: { value: sql`excluded.value` },
    })
    .run()
}

/**
 * Agrega un dia (YYYY-MM-DD UTC) i escriu a daily_stats amb INSERT OR REPLACE.
 * Idempotent: es pot tornar a cridar i actualitza els valors.
 */
export function aggregateDay(date: string): AggregateResult {
  let rowsWritten = 0

  analyticsDb.transaction(() => {
    // page_views total
    const pvRow = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'page_view'`)
      .get()
    upsertStat(date, "page_views", "_total", pvRow?.count ?? 0)
    rowsWritten++

    // page_views_real total — exclou /api i recursos. Aquesta és la mètrica
    // que mostrem a la gràfica del Resum.
    const pageWhere = categoryWhereClause("page")
    const realRow = analyticsDb.$client
      .prepare(
        `SELECT COUNT(*) AS c FROM events WHERE type = 'page_view' AND date(ts) = ? AND path IS NOT NULL AND ${pageWhere}`,
      )
      .get(date) as { c: number } | undefined
    upsertStat(date, "page_views_real", "_total", realRow?.c ?? 0)
    rowsWritten++

    // unique_sessions total
    const usRow = analyticsDb
      .select({ count: sql<number>`COUNT(DISTINCT ${events.sessionId})`.as("count") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date}`)
      .get()
    upsertStat(date, "unique_sessions", "_total", usRow?.count ?? 0)
    rowsWritten++

    // unique_sessions_human: sessions sense bot
    const humanRow = analyticsDb
      .select({ count: sql<number>`COUNT(DISTINCT ${events.sessionId})`.as("count") })
      .from(events)
      .where(
        sql`date(${events.ts}) = ${date} AND ${events.sessionId} IN (SELECT session_id FROM sessions WHERE is_bot = 0)`,
      )
      .get()
    upsertStat(date, "unique_sessions_human", "_total", humanRow?.count ?? 0)
    rowsWritten++

    // bots_filtered: sessions noves del dia on is_bot=1
    const botRow = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(sessions)
      .where(sql`date(${sessions.firstSeen}) = ${date} AND ${sessions.isBot} = 1`)
      .get()
    upsertStat(date, "bots_filtered", "_total", botRow?.count ?? 0)
    rowsWritten++

    // signins
    const signinRow = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'signin_success'`)
      .get()
    upsertStat(date, "signins", "_total", signinRow?.count ?? 0)
    rowsWritten++

    // pdf_downloads
    const pdfRow = analyticsDb
      .select({ count: sql<number>`COUNT(*)`.as("count") })
      .from(events)
      .where(sql`date(${events.ts}) = ${date} AND ${events.type} = 'pdf_download'`)
      .get()
    upsertStat(date, "pdf_downloads", "_total", pdfRow?.count ?? 0)
    rowsWritten++

    // events_by_type
    const byType = analyticsDb
      .select({
        type: events.type,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(events)
      .where(sql`date(${events.ts}) = ${date}`)
      .groupBy(events.type)
      .all()
    for (const row of byType) {
      upsertStat(date, "events_by_type", `type=${row.type}`, row.count)
      rowsWritten++
    }

    // page_views per path (top 100)
    const byPath = analyticsDb
      .select({
        path: events.path,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(events)
      .where(
        sql`date(${events.ts}) = ${date} AND ${events.type} = 'page_view' AND ${events.path} IS NOT NULL`,
      )
      .groupBy(events.path)
      .orderBy(sql`count DESC`)
      .limit(100)
      .all()
    for (const row of byPath) {
      if (row.path !== null) {
        upsertStat(date, "page_views", `path=${row.path}`, row.count)
        rowsWritten++
      }
    }

    // sessions per country (humans)
    const byCountry = analyticsDb
      .select({
        country: sessions.country,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(sessions)
      .where(
        sql`date(${sessions.firstSeen}) = ${date} AND ${sessions.country} IS NOT NULL AND ${sessions.isBot} = 0`,
      )
      .groupBy(sessions.country)
      .all()
    for (const row of byCountry) {
      if (row.country !== null) {
        upsertStat(date, "sessions", `country=${row.country}`, row.count)
        rowsWritten++
      }
    }
  })

  return { date, rowsWritten }
}

/**
 * Agrega tots els dies que tenen events però encara no tenen cap fila a daily_stats.
 * Exclou el dia actual (pot rebre events nous durant el dia).
 */
export function aggregatePending(): { days: string[]; total: number } {
  // Dies amb events anteriors a avui
  const daysWithEvents = analyticsDb
    .select({ d: sql<string>`date(${events.ts})`.as("d") })
    .from(events)
    .where(sql`date(${events.ts}) < date('now')`)
    .groupBy(sql`date(${events.ts})`)
    .orderBy(sql`date(${events.ts})`)
    .all()

  const processedDays: string[] = []
  let total = 0

  for (const { d } of daysWithEvents) {
    // Comprova si ja hi ha algun registre agregat per aquest dia
    const existing = analyticsDb
      .select({ cnt: sql<number>`COUNT(*)`.as("cnt") })
      .from(dailyStats)
      .where(eq(dailyStats.date, d))
      .get()

    if ((existing?.cnt ?? 0) > 0) continue

    const result = aggregateDay(d)
    processedDays.push(d)
    total += result.rowsWritten
  }

  return { days: processedDays, total }
}
