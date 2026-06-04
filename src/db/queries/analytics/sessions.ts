import { desc, eq } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { events, sessions } from "@/db/analyticsSchema"

// ─── Tipus exportats ────────────────────────────────────────

export type SessionDetail = {
  session_id: string
  user_id: number | null
  first_seen: string
  last_seen: string
  is_bot: boolean
  country: string | null
  ua_browser: string | null
  ua_os: string | null
  ua_device: string | null
  entry_path: string | null
  entry_referrer: string | null
}

export type SessionEvent = {
  id: number
  ts: string
  type: string
  path: string | null
  status: number | null
  duration_ms: number | null
  metadata: unknown
}

// ─── API pública ────────────────────────────────────────────

/**
 * Retorna el detall d'una sessió pel seu session_id, o null si no existeix.
 */
export async function getSessionDetail(
  session_id: string,
): Promise<SessionDetail | null> {
  const row = analyticsDb
    .select({
      sessionId: sessions.sessionId,
      userId: sessions.userId,
      firstSeen: sessions.firstSeen,
      lastSeen: sessions.lastSeen,
      isBot: sessions.isBot,
      country: sessions.country,
      uaBrowser: sessions.uaBrowser,
      uaOs: sessions.uaOs,
      uaDevice: sessions.uaDevice,
      entryPath: sessions.entryPath,
      entryReferrer: sessions.entryReferrer,
    })
    .from(sessions)
    .where(eq(sessions.sessionId, session_id))
    .get()

  if (!row) return null

  return {
    session_id: row.sessionId,
    user_id: row.userId,
    first_seen: row.firstSeen ?? "",
    last_seen: row.lastSeen ?? "",
    is_bot: row.isBot === 1,
    country: row.country,
    ua_browser: row.uaBrowser,
    ua_os: row.uaOs,
    ua_device: row.uaDevice,
    entry_path: row.entryPath,
    entry_referrer: row.entryReferrer,
  }
}

/**
 * Retorna els últims events d'una sessió, ordenats per id DESC.
 * El camp `metadata` ve ja deserialitzat (a l'schema està declarat amb
 * mode: "json"), per la qual cosa no cal JSON.parse manual.
 */
export async function getSessionEvents(
  session_id: string,
  limit: number,
): Promise<SessionEvent[]> {
  const rows = analyticsDb
    .select({
      id: events.id,
      ts: events.ts,
      type: events.type,
      path: events.path,
      status: events.status,
      durationMs: events.durationMs,
      metadata: events.metadata,
    })
    .from(events)
    .where(eq(events.sessionId, session_id))
    .orderBy(desc(events.id))
    .limit(limit)
    .all()

  return rows.map((r) => ({
    id: r.id,
    ts: r.ts ?? "",
    type: r.type,
    path: r.path,
    status: r.status,
    duration_ms: r.durationMs,
    metadata: r.metadata,
  }))
}
