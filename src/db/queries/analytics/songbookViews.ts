import { analyticsDb } from "@/db/analyticsClient"

// Visites de cançoners públics (sessions humanes que han obert
// /songbooks/[id]/..., dins la finestra que conserven els events: 90 dies).
// Es fa servir per ordenar resultats de cerca; es recalcula com a molt cada
// VIEWS_TTL_MS perquè la consulta no vagi a cada pulsació del hero.

const VIEWS_TTL_MS = 10 * 60 * 1000

let cache: { at: number; views: Map<number, number> } | null = null

export function getSongbookViewCounts(): Map<number, number> {
  if (cache && Date.now() - cache.at < VIEWS_TTL_MS) return cache.views

  const views = new Map<number, number>()
  try {
    // Rang sobre path (usa events_path_idx): tots els '/songbooks/...'
    const rows = analyticsDb.$client
      .prepare(`
        SELECT e.path AS path, COUNT(DISTINCT e.session_id) AS n
        FROM events e
        JOIN sessions s ON s.session_id = e.session_id
        WHERE e.type = 'page_view'
          AND e.path >= '/songbooks/' AND e.path < '/songbooks0'
          AND s.is_bot = 0
        GROUP BY e.path
      `)
      .all() as Array<{ path: string; n: number }>
    for (const r of rows) {
      const id = Number(r.path.split("/")[2])
      if (Number.isInteger(id) && id > 0) views.set(id, (views.get(id) ?? 0) + r.n)
    }
  } catch (err) {
    // Sense analítica, l'ordre només depèn de les coincidències
    console.error("[getSongbookViewCounts]", err)
  }

  cache = { at: Date.now(), views }
  return views
}
