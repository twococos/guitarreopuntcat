import "server-only"
import fs from "node:fs"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import * as analyticsSchema from "./analyticsSchema"

const dbPath =
  process.env.ANALYTICS_DB_PATH || path.join(process.cwd(), "data", "analytics.db")

// Singleton perquè Next.js fa hot-reload i evitem obrir N connexions.
const globalForAnalytics = globalThis as unknown as {
  sqliteAnalytics?: Database.Database
  analyticsMigrated?: boolean
}

// Assegura que el directori de la BD existeix abans d'obrir-la (clon nou del repo).
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqliteAnalytics = globalForAnalytics.sqliteAnalytics ?? new Database(dbPath)

if (!globalForAnalytics.sqliteAnalytics) {
  sqliteAnalytics.pragma("journal_mode = WAL")
  sqliteAnalytics.pragma("foreign_keys = ON")
  sqliteAnalytics.pragma("synchronous = NORMAL")
  globalForAnalytics.sqliteAnalytics = sqliteAnalytics
}

export const analyticsDb = drizzle(sqliteAnalytics, { schema: analyticsSchema })

// Aplica les migracions pendents a l'arrencada (un sol cop pel singleton), de
// manera que des d'un clon net del repo la BD d'analítiques es crea sola.
if (!globalForAnalytics.analyticsMigrated) {
  migrate(analyticsDb, {
    migrationsFolder: path.join(process.cwd(), "data", "analytics-migrations"),
  })
  globalForAnalytics.analyticsMigrated = true
}
export { analyticsSchema as schema }
export type AnalyticsDB = typeof analyticsDb
