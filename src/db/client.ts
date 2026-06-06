import "server-only"
import fs from "node:fs"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import * as schema from "./schema"

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "canconer.db")

// Singleton perquè Next.js fa hot-reload i evitem obrir N connexions.
const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database
  migrated?: boolean
}

// Assegura que el directori de la BD existeix abans d'obrir-la (clon nou del repo
// on `data/` pot no existir encara).
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = globalForDb.sqlite ?? new Database(dbPath)

if (!globalForDb.sqlite) {
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  globalForDb.sqlite = sqlite
}

export const db = drizzle(sqlite, { schema })

// Aplica les migracions pendents a l'arrencada (un sol cop pel singleton).
// Així, des d'un clon net del repo sense `canconer.db`, la BD es crea sola amb
// l'esquema complet i el primer usuari que s'hi registri esdevé admin (vegeu
// el callback `signIn` a src/lib/auth.ts). Idempotent: drizzle guarda quines
// migracions ja ha aplicat a la taula `__drizzle_migrations`.
if (!globalForDb.migrated) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "data", "migrations") })
  globalForDb.migrated = true
}
export { schema }
export type DB = typeof db
