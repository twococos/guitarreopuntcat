import { analyticsDb } from "@/db/analyticsClient"

// Usa better-sqlite3 raw via analyticsDb.$client per evitar les peculiaritats
// del query builder de Drizzle amb json_extract i GROUP BY sobre el mateix camp.

// ─── Tipus exportats ────────────────────────────────────────

export type TopSearchRow = { q: string; count: number; avg_results: number }

export type ZeroResultSearch = { q: string; count: number }

// ─── API pública ────────────────────────────────────────────

/**
 * Cerques més freqüents en un interval, amb mitjana de resultats.
 */
export async function getTopSearches(
  from: string,
  to: string,
  limit: number,
): Promise<TopSearchRow[]> {
  const stmt = analyticsDb.$client.prepare(`
    SELECT
      json_extract(metadata, '$.q') AS q,
      COUNT(*) AS count,
      AVG(CAST(json_extract(metadata, '$.results') AS INTEGER)) AS avg_results
    FROM events
    WHERE type = 'song_search'
      AND date(ts) BETWEEN ? AND ?
      AND json_extract(metadata, '$.q') IS NOT NULL
      AND json_extract(metadata, '$.q') != ''
    GROUP BY json_extract(metadata, '$.q')
    ORDER BY count DESC
    LIMIT ?
  `)
  const rows = stmt.all(from, to, limit) as Array<{
    q: string | null
    count: number
    avg_results: number | null
  }>

  return rows
    .filter((r): r is { q: string; count: number; avg_results: number | null } =>
      r.q !== null,
    )
    .map((r) => ({
      q: r.q,
      count: r.count,
      avg_results:
        r.avg_results == null ? 0 : Math.round(r.avg_results * 100) / 100,
    }))
}

/**
 * Cerques que han retornat 0 resultats (potencials forats al catàleg).
 */
export async function getZeroResultSearches(
  from: string,
  to: string,
  limit: number,
): Promise<ZeroResultSearch[]> {
  const stmt = analyticsDb.$client.prepare(`
    SELECT
      json_extract(metadata, '$.q') AS q,
      COUNT(*) AS count
    FROM events
    WHERE type = 'song_search'
      AND date(ts) BETWEEN ? AND ?
      AND json_extract(metadata, '$.q') IS NOT NULL
      AND json_extract(metadata, '$.q') != ''
      AND CAST(json_extract(metadata, '$.results') AS INTEGER) = 0
    GROUP BY json_extract(metadata, '$.q')
    ORDER BY count DESC
    LIMIT ?
  `)
  const rows = stmt.all(from, to, limit) as Array<{
    q: string | null
    count: number
  }>

  return rows
    .filter((r): r is { q: string; count: number } => r.q !== null)
    .map((r) => ({ q: r.q, count: r.count }))
}
