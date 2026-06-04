/**
 * Recorder: escriu batches d'events d'analítiques a la BD de forma síncrona.
 * Tota l'escriptura es fa dins d'una transacció better-sqlite3 per minimitzar I/O.
 */

import { sql } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { events, sessions, ipBuckets } from "@/db/analyticsSchema"
import type { QueuedEvent } from "@/lib/analytics/queue"
import type { EventMetadata } from "@/lib/analytics/types"
import type { AnalyticsDB } from "@/db/analyticsClient"

// Tipus intern per al context de transacció Drizzle/better-sqlite3
type TxContext = Parameters<Parameters<AnalyticsDB["transaction"]>[0]>[0]

// Llindar de peticions per minut per marcar una IP com sospitosa.
// La condició `count === threshold + 1` garanteix que la bandera es posa exactament una vegada.
const SUSPICIOUS_RPM_THRESHOLD = parseInt(
  process.env.ANALYTICS_SUSPICIOUS_RPM ?? "120",
  10,
)

/** Processa un event individual dins d'una transacció. Retorna events extra generats (p.ex. suspicious_burst). */
function processEvent(tx: TxContext, ev: QueuedEvent): QueuedEvent[] {
  const extraEvents: QueuedEvent[] = []

  // 1. Upsert de sessió
  if (ev.session_init) {
    // Sessió nova: inserim amb totes les dades; si ja existeix actualitzem last_seen
    tx.insert(sessions)
      .values({
        sessionId: ev.session_id,
        userId: ev.user_id ?? null,
        uaRaw: ev.session_init.ua_raw ?? null,
        uaBrowser: ev.session_init.ua_browser ?? null,
        uaOs: ev.session_init.ua_os ?? null,
        uaDevice: ev.session_init.ua_device ?? null,
        country: ev.session_init.country ?? null,
        isBot: ev.session_init.is_bot ? 1 : 0,
        botKind: ev.session_init.bot_kind ?? null,
        entryPath: ev.session_init.entry_path ?? null,
        entryReferrer: ev.session_init.entry_referrer ?? null,
        utmSource: ev.session_init.utm_source ?? null,
        utmMedium: ev.session_init.utm_medium ?? null,
        utmCampaign: ev.session_init.utm_campaign ?? null,
        utmTerm: ev.session_init.utm_term ?? null,
        utmContent: ev.session_init.utm_content ?? null,
        viewportW: ev.session_init.viewport_w ?? null,
        viewportH: ev.session_init.viewport_h ?? null,
        language: ev.session_init.language ?? null,
      })
      .onConflictDoUpdate({
        target: sessions.sessionId,
        set: { lastSeen: sql`(datetime('now'))` },
      })
      .run()
  } else {
    // Sessió existent: actualitzem només last_seen
    tx.update(sessions)
      .set({ lastSeen: sql`(datetime('now'))` })
      .where(sql`session_id = ${ev.session_id}`)
      .run()
  }

  // 2. Actualitzar bucket d'IP i detectar ràfegues (només per a peticions no-bot)
  if (ev.ip_bucket !== undefined) {
    const bucketMinute = new Date().toISOString().slice(0, 16).replace("T", " ")

    // Upsert: incrementa el comptador si ja existeix, insereix amb 1 si no
    tx.insert(ipBuckets)
      .values({
        ipHash: ev.ip_hash,
        bucketMinute,
        count: 1,
        flagged: 0,
        country: ev.ip_bucket.country ?? null,
        lastIpRaw: ev.ip_bucket.ip_raw ?? null,
      })
      .onConflictDoUpdate({
        target: [ipBuckets.ipHash, ipBuckets.bucketMinute],
        set: {
          count: sql`${ipBuckets.count} + 1`,
          lastIpRaw: sql`excluded.last_ip_raw`,
        },
      })
      .run()

    // Llegim el count actual per detectar si acabem de superar el llindar
    const bucket = tx
      .select({ count: ipBuckets.count })
      .from(ipBuckets)
      .where(
        sql`${ipBuckets.ipHash} = ${ev.ip_hash} AND ${ipBuckets.bucketMinute} = ${bucketMinute}`,
      )
      .get()

    const currentCount = bucket?.count ?? 0

    // La condició `=== threshold + 1` s'activa exactament una vegada per (ip_hash, bucket_minute)
    if (currentCount === SUSPICIOUS_RPM_THRESHOLD + 1) {
      // Marca el bucket com a sospitós
      tx.update(ipBuckets)
        .set({ flagged: 1 })
        .where(
          sql`${ipBuckets.ipHash} = ${ev.ip_hash} AND ${ipBuckets.bucketMinute} = ${bucketMinute}`,
        )
        .run()

      // Afegeix un event suspicious_burst al final del batch (evita recursió)
      extraEvents.push({
        session_id: ev.session_id,
        type: "suspicious_burst",
        path: ev.path ?? null,
        ip_hash: ev.ip_hash,
        ip_raw: ev.ip_raw ?? null,
        metadata: {
          rpm: currentCount,
          threshold: SUSPICIOUS_RPM_THRESHOLD,
        } satisfies EventMetadataMap["suspicious_burst"],
      })
    }
  }

  // 3. Insertar l'event
  tx.insert(events)
    .values({
      sessionId: ev.session_id,
      userId: ev.user_id ?? null,
      type: ev.type,
      path: ev.path ?? null,
      method: ev.method ?? null,
      status: ev.status ?? null,
      ipHash: ev.ip_hash,
      ipRaw: ev.ip_raw ?? null,
      referrer: ev.referrer ?? null,
      // Drizzle amb mode: "json" serialitza l'objecte automàticament
      metadata: (ev.metadata ?? null) as EventMetadata | null,
      durationMs: ev.duration_ms ?? null,
    })
    .run()

  return extraEvents
}

// Import local del tipus per al satisfies de suspicious_burst
import type { EventMetadataMap } from "@/lib/analytics/types"

/**
 * Escriu un batch d'events a la BD d'analítiques en una sola transacció.
 * Mai tira al procés principal; tots els errors es capturen i es registren.
 */
export function writeBatch(eventsToWrite: QueuedEvent[]): void {
  if (eventsToWrite.length === 0) return

  try {
    analyticsDb.transaction((tx) => {
      // Events addicionals generats dins del batch (p.ex. suspicious_burst)
      const extraEvents: QueuedEvent[] = []

      for (const ev of eventsToWrite) {
        const generated = processEvent(tx, ev)
        extraEvents.push(...generated)
      }

      // Processar events addicionals generats (p.ex. suspicious_burst)
      // Aquests no generen nous extras (no porten ip_bucket) — no hi ha recursió
      for (const extra of extraEvents) {
        processEvent(tx, extra)
      }
    })
  } catch (e) {
    // Analytics mai ha de tirar al procés principal
    console.error("[analytics] writeBatch failed", e)
  }
}
