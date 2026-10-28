import type { SpotifyKind, SpotifyTrack } from "@/lib/spotify/url"
import type { ScoredCandidate } from "@/lib/youtube/match"

/** D'on ve una tanda de cançons de la llista de revisió. */
export interface ImportSource {
  kind: SpotifyKind | "search"
  name: string
  count: number
  truncated: boolean
}

/** Resposta de `POST /api/admin/import/match` per a una cançó. */
export interface MatchResult {
  track: SpotifyTrack
  title: string
  artist: string
  candidates: ScoredCandidate[]
  youtube_error: boolean
  duplicate_song_id: number | null
  queued_job: { id: number; status: string } | null
  existing_jobs: Record<string, { id: number; status: string }>
}

export type ReviewStatus = "pending" | "matching" | "ready"

/** Una cançó de la llista «Per encuar». */
export interface ReviewRow {
  key: string
  track: SpotifyTrack
  status: ReviewStatus
  match: MatchResult | null
  /** Vídeo triat (un dels candidats o l'enganxat a mà). */
  videoId: string | null
  /** Vídeo enganxat a mà, que no és entre els candidats. */
  customVideoId: string | null
  checked: boolean
  /** Motiu pel qual no s'ha pogut encuar l'últim cop. */
  enqueueError: string | null
}
