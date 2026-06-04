/**
 * Cache in-memory de IPs bloquejades.
 * Refresca cada 60s llegint de blocked_ips.
 */

import { analyticsDb } from "@/db/analyticsClient"
import { blockedIps } from "@/db/analyticsSchema"

const REFRESH_MS = 60_000

declare global {
  // eslint-disable-next-line no-var
  var __analyticsBlocklist: { set: Set<string>; loadedAt: number } | undefined
}

function loadFromDb(): Set<string> {
  try {
    const rows = analyticsDb.select({ ip_hash: blockedIps.ipHash }).from(blockedIps).all()
    return new Set(rows.map((r) => r.ip_hash))
  } catch (e) {
    console.error("[analytics] blocklist load failed", e)
    return new Set()
  }
}

export function isBlocked(ipHash: string): boolean {
  const state = globalThis.__analyticsBlocklist
  const now = Date.now()
  if (!state || now - state.loadedAt > REFRESH_MS) {
    globalThis.__analyticsBlocklist = { set: loadFromDb(), loadedAt: now }
  }
  return globalThis.__analyticsBlocklist!.set.has(ipHash)
}

export function invalidateBlocklist(): void {
  globalThis.__analyticsBlocklist = undefined
}
