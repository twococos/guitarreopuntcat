export const EVENT_TYPES = [
  "page_view",
  "page_engagement",
  "pdf_download",
  "song_search",
  "song_random",
  "song_view",
  "canconer_create",
  "canconer_update",
  "canconer_delete",
  "canconer_share_open",
  "proposal_create",
  "proposal_approve",
  "proposal_reject",
  "proposal_cancel",
  "signin_success",
  "signin_failure",
  "signout",
  "account_update",
  "account_delete",
  "admin_action",
  "api_error",
  "suspicious_burst",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

// Mapa de metadades discriminat per tipus d'event
export type EventMetadataMap = {
  page_view: { title?: string; query?: Record<string, string> }
  page_engagement: { active_ms: number; scroll_pct: number }
  pdf_download: {
    canconer_id?: number
    songs_count: number
    style?: string
    success: boolean
  }
  song_search: { q: string; results: number }
  song_random: { song_id?: number }
  song_view: { song_id: number; artist_slug: string; song_slug: string }
  canconer_create: { canconer_id: number }
  canconer_update: { canconer_id: number }
  canconer_delete: { canconer_id: number }
  canconer_share_open: { canconer_id?: number; token: string }
  proposal_create: { proposal_id: number }
  proposal_approve: { proposal_id: number }
  proposal_reject: { proposal_id: number }
  proposal_cancel: { proposal_id: number }
  signin_success: { provider?: string }
  signin_failure: { reason: string }
  signout: Record<string, never>
  account_update: Record<string, never>
  account_delete: Record<string, never>
  admin_action: { action: string; target_id?: number }
  api_error: { message: string; code?: string }
  suspicious_burst: { rpm: number; threshold: number }
}

export type EventMetadata = EventMetadataMap[EventType]

// Verificació d'exhaustivitat en temps de compilació
const _exhaustivenessCheck: Record<EventType, unknown> =
  {} as EventMetadataMap satisfies Record<EventType, unknown>
void _exhaustivenessCheck
