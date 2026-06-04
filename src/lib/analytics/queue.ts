/**
 * Queue en memòria per a events d'analítiques amb flush periòdic.
 * Acumula events al buffer i els escriu a la BD en batches per minimitzar I/O.
 */

import type { EventType } from "@/lib/analytics/types"

// Dades d'inicialització d'una sessió nova (primera vegada que la veiem en aquest tick)
type SessionInit = {
  ua_raw?: string | null
  ua_browser?: string | null
  ua_os?: string | null
  ua_device?: string | null
  country?: string | null
  is_bot?: boolean
  bot_kind?: string | null
  entry_path?: string | null
  entry_referrer?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  viewport_w?: number | null
  viewport_h?: number | null
  language?: string | null
}

// Dades per actualitzar el bucket de IP (detecció de ràfegues)
type IpBucket = {
  country: string | null
  ip_raw: string | null
}

export type QueuedEvent = {
  session_id: string
  user_id?: number | null
  type: EventType
  path?: string | null
  method?: string | null
  status?: number | null
  ip_hash: string
  ip_raw?: string | null
  referrer?: string | null
  // Es serialitza a JSON per Drizzle (mode: "json")
  metadata?: unknown
  duration_ms?: number | null
  // Només present si és el primer event de la sessió en aquest tick
  session_init?: SessionInit
  // Només present per a peticions no-bot; el recorder actualitza ip_buckets
  ip_bucket?: IpBucket
}

export class AnalyticsQueue {
  private buffer: QueuedEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private readonly MAX_BUFFER = 100
  private readonly FLUSH_MS = 500

  /**
   * Afegeix un event al buffer.
   * Si s'arriba al màxim, fa flush immediat.
   * Sinó, programa un flush diferit si no n'hi ha cap en curs.
   */
  enqueue(ev: QueuedEvent): void {
    this.buffer.push(ev)

    if (this.buffer.length >= this.MAX_BUFFER) {
      // Flush immediat: cancel·la el timer pendent i escriu ara
      if (this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
      }
      this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  /**
   * Programa el flush diferit si no hi ha cap timer actiu.
   */
  private scheduleFlush(): void {
    if (this.timer !== null) return

    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.FLUSH_MS)
  }

  /**
   * Escriu tots els events acumulats a la BD i buida el buffer.
   * Import dinàmic del recorder per evitar carregar el client de BD fins que sigui necessari.
   */
  flush(): void {
    if (this.buffer.length === 0) return

    const batch = this.buffer
    this.buffer = []

    // Import dinàmic per no forçar la càrrega del client SQLite en cada import de queue
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeBatch } = require("@/lib/analytics/recorder") as {
      writeBatch: (events: QueuedEvent[]) => void
    }
    writeBatch(batch)
  }
}

// Singleton via globalThis per evitar múltiples instàncies durant el hot-reload de Next dev
declare global {
  // eslint-disable-next-line no-var
  var __analyticsQueue: AnalyticsQueue | undefined
}

export const analyticsQueue: AnalyticsQueue =
  globalThis.__analyticsQueue ?? new AnalyticsQueue()

if (process.env.NODE_ENV !== "production") {
  globalThis.__analyticsQueue = analyticsQueue
}
