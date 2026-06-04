import type { Config } from "drizzle-kit"

export default {
  schema: "./src/db/analyticsSchema.ts",
  out: "./data/analytics-migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.ANALYTICS_DB_PATH || "./data/analytics.db",
  },
} satisfies Config
