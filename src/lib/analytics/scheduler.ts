import { aggregatePending } from "./aggregate"
import { anonymizeOldIps, purgeOldEvents, purgeOldSalts } from "./maintenance"

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

declare global {
  // eslint-disable-next-line no-var
  var __analyticsScheduler: NodeJS.Timeout | undefined
}

export function startAnalyticsScheduler(): void {
  if (globalThis.__analyticsScheduler) return // ja arrencat

  // Executa una primera vegada poc després d'arrencar (no immediat per no bloquejar startup)
  const initial = setTimeout(() => {
    runOnce()
    globalThis.__analyticsScheduler = setInterval(runOnce, SIX_HOURS_MS)
  }, 60_000) // 1 minut després de l'startup

  globalThis.__analyticsScheduler = initial
}

function runOnce(): void {
  try {
    const agg = aggregatePending()
    const eventsResult = purgeOldEvents()
    const ips = anonymizeOldIps()
    const saltsResult = purgeOldSalts()
    console.log(
      `[analytics] maintenance OK — aggregated ${agg.days.length} day(s), purged ${eventsResult.deleted} events, anonymized ${ips.events} events / ${ips.buckets} buckets, deleted ${saltsResult.deleted} salts`,
    )
  } catch (e) {
    console.error("[analytics] maintenance failed", e)
  }
}
