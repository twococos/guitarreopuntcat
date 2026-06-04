/**
 * Classificació de paths en categories per a l'analítica.
 * Lògica compartida entre client (filtres UI) i SQL (predicats).
 */

export type PathCategory =
  | "page"      // qualsevol pàgina visitable (no /api/)
  | "public"    // pàgines públiques: /, /songs*, /projecte, /contacte, /c/*
  | "app"       // pàgines de l'app: /app*
  | "song"      // /songs/[artist]/[song]
  | "artist"    // /songs/[artist]
  | "api"       // /api/*

export function categoryOf(path: string): Exclude<PathCategory, "page"> | null {
  if (path.startsWith("/api/") || path === "/api") return "api"
  if (path.startsWith("/app")) return "app"
  if (path.startsWith("/songs")) {
    // /songs (índex) → public, /songs/[a] → artist, /songs/[a]/[s] → song
    const segments = path.split("/").filter(Boolean)
    if (segments.length === 1) return "public"          // /songs
    if (segments.length === 2) return "artist"          // /songs/[a]
    if (segments.length >= 3) return "song"             // /songs/[a]/[s]
  }
  if (path === "/" || path === "/projecte" || path === "/contacte") return "public"
  if (path.startsWith("/c/")) return "public"
  return null
}

/**
 * Genera el fragment SQL del predicat WHERE per a una categoria.
 * Usat dins de queries directes a la BD analytics.
 */
export function categoryWhereClause(category: PathCategory): string {
  switch (category) {
    case "page":
      return "path NOT LIKE '/api/%' AND path != '/api' AND path NOT LIKE '/img/%' AND path NOT LIKE '/_next/%' AND path != '/favicon.ico' AND path NOT LIKE '/api/track%'"
    case "public":
      return "(path = '/' OR path = '/songs' OR path LIKE '/songs/%' OR path = '/projecte' OR path = '/contacte' OR path LIKE '/c/%')"
    case "app":
      return "(path = '/app' OR path LIKE '/app/%')"
    case "song":
      // /songs/<a>/<s> — tres segments. Necessitem path LIKE '/songs/%/%' AMB un sol slash extra
      // Format: /songs/<algo>/<algo>  (i opcionalment /songs/<a>/<s>/...)
      return "path LIKE '/songs/%/%' AND path NOT LIKE '/songs/%/%/%'"
    case "artist":
      // /songs/<a> — dos segments exactes
      return "path LIKE '/songs/%' AND path NOT LIKE '/songs/%/%'"
    case "api":
      return "(path LIKE '/api/%' OR path = '/api')"
  }
}
