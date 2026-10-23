import type { Song, Canconer, CanconerSong, SongProposal, User } from "@/db/schema"
import type { CanconerStyle } from "@/lib/schemas/canconer"
import type { SongKind } from "@/lib/songKind"
import type { QuickArrangement } from "@/lib/schemas/arrangement"

export type { Song, Canconer, CanconerSong, SongProposal, User }
export type { CanconerStyle }

// Cançó tal com es mostra a la llista (sense `content`, més lleuger).
// `kind` el porta GET /api/songs: les pròpies no públiques s'etiqueten.
export type SongSummary = Omit<Song, "content"> & { kind?: SongKind }

// Entrada dins un cançoner: cançó + transposició + arranjament ràpid (§22)
export interface CanconerEntry {
  song: Song
  semitones: number
  arrangement?: QuickArrangement | null
}

// Referència a una cançó d'un cançoner (desar, PDF, sessionStorage)
export interface CanconerSongRef {
  id: number
  semitones: number
  arrangement?: QuickArrangement | null
}

// Forma del JSON que es passa al POST /api/canconers per guardar
export interface CanconerSavePayload {
  id?: number
  title: string
  style: CanconerStyle
  accent_color: string | null
  songs: CanconerSongRef[]
}

// Resposta de GET /api/canconers (llista)
export interface CanconerListItem {
  id: number
  title: string
  style: CanconerStyle
  accent_color: string | null
  created_at: string
  updated_at: string
  share_token: string | null
  song_count: number
}

// Resposta de GET /api/canconers/:id (detall)
export interface CanconerDetail extends CanconerListItem {
  songs: Array<Song & { semitones: number; position: number; arrangement?: QuickArrangement | null }>
}

// Resposta de GET /api/proposals
export interface ProposalListItem {
  id: number
  status: "pending" | "approved" | "rejected"
  notes: string | null
  created_at: string
  reviewed_at: string | null
  song: Song
  user_name: string
  reviewer_name: string | null
}
