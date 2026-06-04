export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAnalyticsScheduler } = await import("./src/lib/analytics/scheduler")
    startAnalyticsScheduler()
  }
}
