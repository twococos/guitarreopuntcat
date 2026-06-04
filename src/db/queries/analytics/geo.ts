import { sql } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { sessions } from "@/db/analyticsSchema"

// ─── Tipus exportats ────────────────────────────────────────

export type GeoRow = { country: string; sessions: number }

// ─── API pública ────────────────────────────────────────────

/**
 * Sessions humanes per país (codi ISO2) en un interval.
 */
export async function getSessionsByCountry(
  from: string,
  to: string,
): Promise<GeoRow[]> {
  const rows = analyticsDb
    .select({
      country: sessions.country,
      sessions: sql<number>`COUNT(*)`.as("sessions"),
    })
    .from(sessions)
    .where(
      sql`${sessions.isBot} = 0 AND ${sessions.country} IS NOT NULL AND date(${sessions.firstSeen}) BETWEEN ${from} AND ${to}`,
    )
    .groupBy(sessions.country)
    .orderBy(sql`sessions DESC`)
    .all()

  return rows
    .filter((r): r is { country: string; sessions: number } => r.country !== null)
    .map((r) => ({ country: r.country, sessions: r.sessions }))
}
