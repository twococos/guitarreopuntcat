import type { Config } from "drizzle-kit"
import "dotenv/config"

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./data/canconer.db",
  },
  verbose: true,
  strict: true,
} satisfies Config
