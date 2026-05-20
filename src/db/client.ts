import "server-only"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import * as schema from "./schema"

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "canconer.db")

// Singleton perquè Next.js fa hot-reload i evitem obrir N connexions.
const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database
}

const sqlite = globalForDb.sqlite ?? new Database(dbPath)

if (!globalForDb.sqlite) {
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  globalForDb.sqlite = sqlite
}

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db
