import "server-only"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import * as analyticsSchema from "./analyticsSchema"

const dbPath =
  process.env.ANALYTICS_DB_PATH || path.join(process.cwd(), "data", "analytics.db")

// Singleton perquè Next.js fa hot-reload i evitem obrir N connexions.
const globalForAnalytics = globalThis as unknown as {
  sqliteAnalytics?: Database.Database
}

const sqliteAnalytics = globalForAnalytics.sqliteAnalytics ?? new Database(dbPath)

if (!globalForAnalytics.sqliteAnalytics) {
  sqliteAnalytics.pragma("journal_mode = WAL")
  sqliteAnalytics.pragma("foreign_keys = ON")
  sqliteAnalytics.pragma("synchronous = NORMAL")
  globalForAnalytics.sqliteAnalytics = sqliteAnalytics
}

export const analyticsDb = drizzle(sqliteAnalytics, { schema: analyticsSchema })
export { analyticsSchema as schema }
export type AnalyticsDB = typeof analyticsDb
