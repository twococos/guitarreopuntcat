import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { aggregatePending } from "@/lib/analytics/aggregate"
import { anonymizeOldIps, purgeOldEvents, purgeOldSalts } from "@/lib/analytics/maintenance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const agg = aggregatePending()
  const eventsResult = purgeOldEvents()
  const ips = anonymizeOldIps()
  const saltsResult = purgeOldSalts()

  return NextResponse.json({
    aggregated_days: agg.days,
    aggregated_rows: agg.total,
    purged_events: eventsResult.deleted,
    anonymized_events: ips.events,
    anonymized_buckets: ips.buckets,
    purged_salts: saltsResult.deleted,
  })
}
