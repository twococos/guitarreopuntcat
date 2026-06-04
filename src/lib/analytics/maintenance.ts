import { analyticsDb } from "@/db/analyticsClient"
import { events, ipBuckets, salts } from "@/db/analyticsSchema"
import { sql } from "drizzle-orm"

/**
 * Purga els events crus de fa més de 90 dies.
 * Cal executar-lo DESPRÉS d'aggregatePending per no perdre dades.
 */
export function purgeOldEvents(): { deleted: number } {
  try {
    const result = analyticsDb
      .delete(events)
      .where(sql`${events.ts} < datetime('now', '-90 days')`)
      .run()
    return { deleted: result.changes }
  } catch (e) {
    console.error("[analytics] purgeOldEvents error", e)
    return { deleted: 0 }
  }
}

/**
 * Anonimitza les IPs crues de fa més de 30 dies:
 * - Posa ip_raw a NULL a events
 * - Posa last_ip_raw a NULL a ip_buckets
 */
export function anonymizeOldIps(): { events: number; buckets: number } {
  try {
    const eventsResult = analyticsDb
      .update(events)
      .set({ ipRaw: null })
      .where(
        sql`${events.ipRaw} IS NOT NULL AND ${events.ts} < datetime('now', '-30 days')`,
      )
      .run()

    const bucketsResult = analyticsDb
      .update(ipBuckets)
      .set({ lastIpRaw: null })
      .where(
        sql`${ipBuckets.lastIpRaw} IS NOT NULL AND ${ipBuckets.bucketMinute} < strftime('%Y-%m-%d %H:%M', 'now', '-30 days')`,
      )
      .run()

    return { events: eventsResult.changes, buckets: bucketsResult.changes }
  } catch (e) {
    console.error("[analytics] anonymizeOldIps error", e)
    return { events: 0, buckets: 0 }
  }
}

/**
 * Purga els salts de fa més de 60 dies.
 * Els salts del dia en curs i els recents es mantenen.
 */
export function purgeOldSalts(): { deleted: number } {
  try {
    const result = analyticsDb
      .delete(salts)
      .where(sql`${salts.date} < date('now', '-60 days')`)
      .run()
    return { deleted: result.changes }
  } catch (e) {
    console.error("[analytics] purgeOldSalts error", e)
    return { deleted: 0 }
  }
}
