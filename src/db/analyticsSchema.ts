import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { EventMetadata } from "@/lib/analytics/types"

// ─── Sessions ───────────────────────────────────────────────
// Nota: user_id és una referència lògica a users.id de la BD principal.
// No es declara com a FK perquè les dues BDs són fitxers SQLite separats.
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    userId: integer("user_id"),
    firstSeen: text("first_seen").default(sql`(datetime('now'))`),
    lastSeen: text("last_seen").default(sql`(datetime('now'))`),
    // ua_raw es purga als 90 dies
    uaRaw: text("ua_raw"),
    uaBrowser: text("ua_browser"),
    uaOs: text("ua_os"),
    // desktop | mobile | tablet | bot
    uaDevice: text("ua_device"),
    // Codi ISO2 del país
    country: text("country"),
    isBot: integer("is_bot").notNull().default(0),
    // "isbot" | "heuristic" | null
    botKind: text("bot_kind"),
    entryPath: text("entry_path"),
    entryReferrer: text("entry_referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    viewportW: integer("viewport_w"),
    viewportH: integer("viewport_h"),
    language: text("language"),
  },
  (t) => ({
    sessionIdUnique: uniqueIndex("sessions_session_id_unique").on(t.sessionId),
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
    firstSeenIdx: index("sessions_first_seen_idx").on(t.firstSeen),
    isBotFirstSeenIdx: index("sessions_is_bot_first_seen_idx").on(t.isBot, t.firstSeen),
  }),
)

// ─── Events ─────────────────────────────────────────────────
// ip_raw es purga als 30 dies
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    userId: integer("user_id"),
    ts: text("ts").default(sql`(datetime('now'))`),
    type: text("type").notNull(),
    path: text("path"),
    method: text("method"),
    status: integer("status"),
    ipHash: text("ip_hash").notNull(),
    // ip_raw es purga als 30 dies
    ipRaw: text("ip_raw"),
    referrer: text("referrer"),
    metadata: text("metadata", { mode: "json" }).$type<EventMetadata>(),
    durationMs: integer("duration_ms"),
  },
  (t) => ({
    tsIdx: index("events_ts_idx").on(t.ts),
    typeTsIdx: index("events_type_ts_idx").on(t.type, t.ts),
    sessionIdIdx: index("events_session_id_idx").on(t.sessionId),
    userIdTsIdx: index("events_user_id_ts_idx").on(t.userId, t.ts),
    pathIdx: index("events_path_idx").on(t.path),
    ipHashTsIdx: index("events_ip_hash_ts_idx").on(t.ipHash, t.ts),
  }),
)

// ─── Buckets d'IP (detecció de ràfegues) ────────────────────
// Comptador per minut i IP per detectar abusos
export const ipBuckets = sqliteTable(
  "ip_buckets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ipHash: text("ip_hash").notNull(),
    // Format: YYYY-MM-DD HH:MM
    bucketMinute: text("bucket_minute").notNull(),
    count: integer("count").notNull().default(1),
    flagged: integer("flagged").notNull().default(0),
    country: text("country"),
    // last_ip_raw es purga als 30 dies
    lastIpRaw: text("last_ip_raw"),
  },
  (t) => ({
    hashMinuteUnique: uniqueIndex("ip_buckets_hash_minute_unique").on(
      t.ipHash,
      t.bucketMinute,
    ),
    flaggedIdx: index("ip_buckets_flagged_idx").on(t.flagged, t.bucketMinute),
  }),
)

// ─── Estadístiques diàries agregades ────────────────────────
export const dailyStats = sqliteTable(
  "daily_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Format: YYYY-MM-DD
    date: text("date").notNull(),
    metric: text("metric").notNull(),
    // Exemples: country=ES, path=/songs, _total
    dimension: text("dimension").notNull().default("_total"),
    value: integer("value").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    dailyStatsUnique: uniqueIndex("daily_stats_unique").on(t.date, t.metric, t.dimension),
    metricDateIdx: index("daily_stats_metric_date_idx").on(t.metric, t.date),
  }),
)

// ─── Salts de hash diari (rotació d'anonimització) ──────────
export const salts = sqliteTable(
  "salts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Format: YYYY-MM-DD
    date: text("date").notNull(),
    salt: text("salt").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    dateUnique: uniqueIndex("salts_date_unique").on(t.date),
  }),
)

// ─── IPs bloquejades ────────────────────────────────────────
export const blockedIps = sqliteTable(
  "blocked_ips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ipHash: text("ip_hash").notNull(),
    reason: text("reason"),
    blockedAt: text("blocked_at").default(sql`(datetime('now'))`),
    // Referència lògica a users.id (admin) de la BD principal
    blockedBy: integer("blocked_by"),
    expiresAt: text("expires_at"),
  },
  (t) => ({
    hashUnique: uniqueIndex("blocked_ips_hash_unique").on(t.ipHash),
  }),
)

// ─── Tipus inferits ─────────────────────────────────────────
export type Session = typeof sessions.$inferSelect
export type SessionInsert = typeof sessions.$inferInsert
export type Event = typeof events.$inferSelect
export type EventInsert = typeof events.$inferInsert
export type IpBucket = typeof ipBuckets.$inferSelect
export type IpBucketInsert = typeof ipBuckets.$inferInsert
export type DailyStat = typeof dailyStats.$inferSelect
export type DailyStatInsert = typeof dailyStats.$inferInsert
export type Salt = typeof salts.$inferSelect
export type SaltInsert = typeof salts.$inferInsert
export type BlockedIp = typeof blockedIps.$inferSelect
export type BlockedIpInsert = typeof blockedIps.$inferInsert
