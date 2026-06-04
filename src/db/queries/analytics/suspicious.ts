import { eq, sql } from "drizzle-orm"
import { analyticsDb } from "@/db/analyticsClient"
import { blockedIps } from "@/db/analyticsSchema"

// ─── Tipus exportats ────────────────────────────────────────

export type SuspiciousIpRow = {
  ip_hash: string
  bucket_minute: string
  count: number
  country: string | null
  last_ip_raw: string | null
  blocked: boolean
}

export type BlockedIpRow = {
  id: number
  ip_hash: string
  reason: string | null
  blocked_at: string
  blocked_by: number | null
  expires_at: string | null
}

// ─── API pública ────────────────────────────────────────────

/**
 * IPs marcades com a sospitoses (flagged=1), ordenades per count DESC i
 * bucket_minute DESC. Indica també si ja són a blocked_ips.
 */
export async function getSuspiciousIps(limit: number): Promise<SuspiciousIpRow[]> {
  // Es fa amb SQL raw perquè barreja LEFT JOIN amb CASE i Drizzle no expressa
  // la condició "any matching row" de manera elegant.
  const stmt = analyticsDb.$client.prepare(`
    SELECT ib.ip_hash AS ip_hash,
           ib.bucket_minute AS bucket_minute,
           ib.count AS count,
           ib.country AS country,
           ib.last_ip_raw AS last_ip_raw,
           CASE WHEN bi.id IS NOT NULL THEN 1 ELSE 0 END AS blocked
      FROM ip_buckets ib
      LEFT JOIN blocked_ips bi ON bi.ip_hash = ib.ip_hash
     WHERE ib.flagged = 1
     ORDER BY ib.count DESC, ib.bucket_minute DESC
     LIMIT ?
  `)

  const rows = stmt.all(limit) as Array<{
    ip_hash: string
    bucket_minute: string
    count: number
    country: string | null
    last_ip_raw: string | null
    blocked: number
  }>

  return rows.map((r) => ({
    ip_hash: r.ip_hash,
    bucket_minute: r.bucket_minute,
    count: r.count,
    country: r.country,
    last_ip_raw: r.last_ip_raw,
    blocked: r.blocked === 1,
  }))
}

/**
 * Llista totes les IPs bloquejades manualment.
 */
export async function getBlockedIps(): Promise<BlockedIpRow[]> {
  const rows = analyticsDb
    .select({
      id: blockedIps.id,
      ipHash: blockedIps.ipHash,
      reason: blockedIps.reason,
      blockedAt: blockedIps.blockedAt,
      blockedBy: blockedIps.blockedBy,
      expiresAt: blockedIps.expiresAt,
    })
    .from(blockedIps)
    .orderBy(sql`${blockedIps.blockedAt} DESC`)
    .all()

  return rows.map((r) => ({
    id: r.id,
    ip_hash: r.ipHash,
    reason: r.reason,
    blocked_at: r.blockedAt ?? "",
    blocked_by: r.blockedBy,
    expires_at: r.expiresAt,
  }))
}

/**
 * Bloqueja una IP. INSERT OR REPLACE perquè el camp ip_hash és UNIQUE
 * i així evitem un error si ja existeix una entrada per a aquesta IP.
 */
export async function blockIp(input: {
  ip_hash: string
  reason: string | null
  blocked_by: number
}): Promise<{ id: number }> {
  const stmt = analyticsDb.$client.prepare(`
    INSERT OR REPLACE INTO blocked_ips (ip_hash, reason, blocked_by, blocked_at)
    VALUES (?, ?, ?, datetime('now'))
  `)
  const res = stmt.run(input.ip_hash, input.reason, input.blocked_by)
  return { id: Number(res.lastInsertRowid) }
}

/**
 * Desbloqueja una IP eliminant-la de blocked_ips.
 */
export async function unblockIp(ip_hash: string): Promise<void> {
  analyticsDb.delete(blockedIps).where(eq(blockedIps.ipHash, ip_hash)).run()
}
