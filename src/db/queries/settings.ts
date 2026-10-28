import "server-only"
import { eq, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"

/** Opcions globals (taula `app_settings`, clau → valor en text). */

export function getSetting(key: string): string | null {
  const row = db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .get()
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: sql`datetime('now')` } })
    .run()
}

// ─── Ordre de la cua de transcripcions ──────────────────────

export type QueueOrder = "fifo" | "lifo"

const QUEUE_ORDER_KEY = "transcription_queue_order"

export function getQueueOrder(): QueueOrder {
  return getSetting(QUEUE_ORDER_KEY) === "lifo" ? "lifo" : "fifo"
}

export function setQueueOrder(order: QueueOrder): void {
  setSetting(QUEUE_ORDER_KEY, order)
}
