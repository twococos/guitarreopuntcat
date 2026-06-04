/**
 * Emissions d'events generats pel tracker client-side.
 * Cridat des de src/app/api/track/route.ts.
 */

import { logEvent } from "./logEvent"

type EngagementInput = {
  path: string
  active_ms: number
  scroll_pct: number
  viewport_w?: number
  viewport_h?: number
  request?: Request
}

/**
 * Registra un event de page_engagement.
 * viewport_w/h queden ignorats per ara — s'actualitzaran a sessions en una iteracio posterior.
 * El path ja es capturat pel middleware al primer page_view amb la mateixa cookie.
 */
export function enqueueEngagement(input: EngagementInput): void {
  logEvent({
    type: "page_engagement",
    request: input.request,
    metadata: {
      active_ms: input.active_ms,
      scroll_pct: input.scroll_pct,
    },
  })
}
