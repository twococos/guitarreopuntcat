import { analyticsDb } from "@/db/analyticsClient"
import { categoryWhereClause, type PathCategory } from "@/lib/analytics/pathCategory"

// ─── Tipus exportats ────────────────────────────────────────

export type TopPageRow = {
  path: string
  views: number
  avg_engagement_ms: number | null
}

export type CategoryAggregate = {
  category: PathCategory
  total_views: number
  unique_paths: number
  avg_views_per_path: number
  total_engagement_events: number
  avg_engagement_ms: number | null
}

export type SongOrArtistRow = {
  slug: string
  artist_slug: string
  song_slug: string | null
  title: string
  artist: string | null
  views: number
  pct_of_total: number
}

// ─── Top pàgines per categoria ────────────────────────────────

/**
 * Top pàgines visitades dins una categoria, amb temps actiu mig per pàgina.
 * Filtra bots (sessions.is_bot=0).
 */
export async function getTopPagesByCategory(
  category: PathCategory,
  from: string,
  to: string,
  limit: number,
): Promise<TopPageRow[]> {
  const where = categoryWhereClause(category).replace(/\bpath\b/g, "e.path")
  const stmt = analyticsDb.$client.prepare(`
    SELECT
      e.path AS path,
      COUNT(*) AS views,
      (
        SELECT AVG(CAST(json_extract(metadata, '$.active_ms') AS INTEGER))
        FROM events
        WHERE type = 'page_engagement'
          AND path = e.path
          AND date(ts) BETWEEN ? AND ?
      ) AS avg_engagement_ms
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND e.path IS NOT NULL
      AND ${where}
    GROUP BY e.path
    ORDER BY views DESC
    LIMIT ?
  `)
  const rows = stmt.all(from, to, from, to, limit) as Array<{
    path: string
    views: number
    avg_engagement_ms: number | null
  }>
  return rows.map((r) => ({
    path: r.path,
    views: r.views,
    avg_engagement_ms:
      r.avg_engagement_ms == null ? null : Math.round(r.avg_engagement_ms),
  }))
}

// Compatibilitat: la firma antiga rep només (from, to, limit) i retorna la
// categoria "page" (totes les pàgines reals). Mantenim aquest helper per a
// no trencar imports existents.
export async function getTopPages(
  from: string,
  to: string,
  limit: number,
): Promise<TopPageRow[]> {
  return getTopPagesByCategory("page", from, to, limit)
}

// ─── Agregats per categoria ──────────────────────────────────

/**
 * Estadístiques globals d'una categoria.
 */
export async function getCategoryAggregate(
  category: PathCategory,
  from: string,
  to: string,
): Promise<CategoryAggregate> {
  const where = categoryWhereClause(category).replace(/\bpath\b/g, "e.path")
  const stmt = analyticsDb.$client.prepare(`
    SELECT
      COUNT(*) AS total_views,
      COUNT(DISTINCT e.path) AS unique_paths
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND e.path IS NOT NULL
      AND ${where}
  `)
  const totals = stmt.get(from, to) as {
    total_views: number
    unique_paths: number
  }

  const engWhere = categoryWhereClause(category)
  const engStmt = analyticsDb.$client.prepare(`
    SELECT
      COUNT(*) AS engagement_events,
      AVG(CAST(json_extract(metadata, '$.active_ms') AS INTEGER)) AS avg_ms
    FROM events
    WHERE type = 'page_engagement'
      AND date(ts) BETWEEN ? AND ?
      AND path IS NOT NULL
      AND ${engWhere}
  `)
  const eng = engStmt.get(from, to) as {
    engagement_events: number
    avg_ms: number | null
  }

  return {
    category,
    total_views: totals.total_views,
    unique_paths: totals.unique_paths,
    avg_views_per_path:
      totals.unique_paths === 0
        ? 0
        : Math.round((totals.total_views / totals.unique_paths) * 10) / 10,
    total_engagement_events: eng.engagement_events,
    avg_engagement_ms: eng.avg_ms == null ? null : Math.round(eng.avg_ms),
  }
}

// ─── Top cançons / artistes amb metadades ────────────────────

/**
 * Top cançons visitades. Resol slugs → títol/artista via BD principal.
 */
export async function getTopSongs(
  from: string,
  to: string,
  limit: number,
): Promise<SongOrArtistRow[]> {
  const where = categoryWhereClause("song").replace(/\bpath\b/g, "e.path")
  const stmt = analyticsDb.$client.prepare(`
    SELECT e.path AS path, COUNT(*) AS views
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND ${where}
    GROUP BY e.path
    ORDER BY views DESC
    LIMIT ?
  `)
  const rows = stmt.all(from, to, limit) as Array<{
    path: string
    views: number
  }>

  // Total de la categoria per al %
  const totalStmt = analyticsDb.$client.prepare(`
    SELECT COUNT(*) AS c
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND ${where}
  `)
  const total = (totalStmt.get(from, to) as { c: number }).c

  const { db, schema } = await import("@/db/client")
  const { eq, and } = await import("drizzle-orm")

  const result: SongOrArtistRow[] = []
  for (const r of rows) {
    const segs = r.path.split("/").filter(Boolean)
    const artistSlug = segs[1]
    const songSlug = segs[2]
    if (!artistSlug || !songSlug) continue

    const song = db
      .select({
        title: schema.songs.title,
        artist: schema.songs.artist,
      })
      .from(schema.songs)
      .where(
        and(
          eq(schema.songs.artistSlug, artistSlug),
          eq(schema.songs.songSlug, songSlug),
        ),
      )
      .get()

    result.push({
      slug: `${artistSlug}/${songSlug}`,
      artist_slug: artistSlug,
      song_slug: songSlug,
      title: song?.title ?? songSlug,
      artist: song?.artist ?? null,
      views: r.views,
      pct_of_total: total === 0 ? 0 : Math.round((r.views / total) * 1000) / 10,
    })
  }
  return result
}

/**
 * Top artistes visitats. Resol slugs → nom d'artista via BD principal.
 */
export async function getTopArtists(
  from: string,
  to: string,
  limit: number,
): Promise<SongOrArtistRow[]> {
  const where = categoryWhereClause("artist").replace(/\bpath\b/g, "e.path")
  const stmt = analyticsDb.$client.prepare(`
    SELECT e.path AS path, COUNT(*) AS views
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND ${where}
    GROUP BY e.path
    ORDER BY views DESC
    LIMIT ?
  `)
  const rows = stmt.all(from, to, limit) as Array<{
    path: string
    views: number
  }>

  const totalStmt = analyticsDb.$client.prepare(`
    SELECT COUNT(*) AS c
    FROM events e
    JOIN sessions s ON s.session_id = e.session_id
    WHERE e.type = 'page_view'
      AND s.is_bot = 0
      AND date(e.ts) BETWEEN ? AND ?
      AND ${where}
  `)
  const total = (totalStmt.get(from, to) as { c: number }).c

  const { db, schema } = await import("@/db/client")
  const { eq } = await import("drizzle-orm")

  const result: SongOrArtistRow[] = []
  for (const r of rows) {
    const segs = r.path.split("/").filter(Boolean)
    const artistSlug = segs[1]
    if (!artistSlug) continue

    const sample = db
      .select({ artist: schema.songs.artist })
      .from(schema.songs)
      .where(eq(schema.songs.artistSlug, artistSlug))
      .limit(1)
      .get()

    result.push({
      slug: artistSlug,
      artist_slug: artistSlug,
      song_slug: null,
      title: sample?.artist ?? artistSlug,
      artist: null,
      views: r.views,
      pct_of_total: total === 0 ? 0 : Math.round((r.views / total) * 1000) / 10,
    })
  }
  return result
}

// ─── Sèries temporals per a la gràfica xula ───────────────────

/**
 * Per a cada path al `topPaths`, retorna l'evolució diària com a %
 * del total diari de la seva categoria.
 */
export async function getCategoryTimeseries(
  category: "song" | "artist",
  topPaths: string[],
  from: string,
  to: string,
): Promise<
  Array<{
    path: string
    date: string
    value: number
    total_for_day: number
  }>
> {
  if (topPaths.length === 0) return []
  const where = categoryWhereClause(category).replace(/\bpath\b/g, "e.path")
  const inPlaceholders = topPaths.map(() => "?").join(",")
  const stmt = analyticsDb.$client.prepare(`
    WITH path_counts AS (
      SELECT
        date(e.ts) AS d,
        e.path AS path,
        COUNT(*) AS value
      FROM events e
      JOIN sessions s ON s.session_id = e.session_id
      WHERE e.type = 'page_view'
        AND s.is_bot = 0
        AND date(e.ts) BETWEEN ? AND ?
        AND e.path IN (${inPlaceholders})
      GROUP BY date(e.ts), e.path
    ),
    daily_totals AS (
      SELECT
        date(e.ts) AS d,
        COUNT(*) AS total
      FROM events e
      JOIN sessions s ON s.session_id = e.session_id
      WHERE e.type = 'page_view'
        AND s.is_bot = 0
        AND date(e.ts) BETWEEN ? AND ?
        AND ${where}
      GROUP BY date(e.ts)
    )
    SELECT pc.d AS date, pc.path AS path, pc.value AS value,
           COALESCE(dt.total, 0) AS total_for_day
    FROM path_counts pc
    LEFT JOIN daily_totals dt ON dt.d = pc.d
    ORDER BY pc.d ASC
  `)
  return stmt.all(from, to, ...topPaths, from, to) as Array<{
    path: string
    date: string
    value: number
    total_for_day: number
  }>
}
