import type { YtCandidate } from "./searchResults"

/**
 * Tria del vídeo de YouTube que correspon a una cançó de Spotify. Pur.
 *
 * Volem la versió d'estudi: la durada ha de coincidir (és el senyal més fort:
 * un directe, un videoclip amb introducció o una versió retallada se'n van
 * segons), el canal ha de ser el de l'artista (o el seu «- Topic», l'àudio
 * de la discogràfica) i el títol no ha de dir que és una altra versió.
 */

export interface MatchTrack {
  title: string
  artists: string[]
  duration_ms: number
}

export type MatchConfidence = "high" | "medium" | "low"

export interface ScoredCandidate extends YtCandidate {
  score: number
  /** Durada del vídeo menys la de Spotify, en segons (null si no se sap). */
  delta_s: number | null
  /** Paraula del títol que indica una altra versió (directe, cover…), si n'hi ha. */
  other_version: string | null
  confidence: MatchConfidence
}

/** Minúscules, sense accents ni signes; els espais es conserven (un sol espai). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const compact = (text: string) => normalize(text).replace(/ /g, "")

// Paraules (normalitzades) que indiquen una altra versió o un vídeo que no és la cançó
const OTHER_VERSION = [
  "live", "en directe", "directe", "en directo", "en vivo", "ao vivo", "concert", "concierto", "unplugged",
  "acoustic", "acustic", "acustico", "acustica", "cover", "karaoke", "remix", "instrumental", "slowed",
  "sped up", "speed up", "nightcore", "8d", "reverb", "tutorial", "lesson", "how to play", "chords",
  "acords", "acordes", "reaction", "reaccion", "piano version", "guitar version", "mashup", "medley",
  "bass boosted", "letra y acordes", "flashmob",
]
// Vídeos amb la lletra: solen tenir l'àudio d'estudi, però val més l'original
const LYRICS = ["lyrics", "lyric", "letra", "lletra", "amb lletra", "con letra"]

function containsPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `)
}

function durationScore(delta: number | null): number {
  if (delta === null) return -20
  const d = Math.abs(delta)
  if (d <= 3) return 40
  if (d <= 8) return 25
  if (d <= 20) return 5
  if (d <= 60) return -30
  return -60
}

export function scoreCandidate(track: MatchTrack, cand: YtCandidate): Omit<ScoredCandidate, "confidence"> {
  const title = normalize(cand.title)
  const songTitle = normalize(track.title)
  const artists = track.artists.map(compact).filter(Boolean)
  const channel = compact(cand.channel.replace(/ - Topic$/, ""))

  const delta = cand.duration_s === null || track.duration_ms <= 0 ? null : cand.duration_s - track.duration_ms / 1000
  let score = durationScore(delta)

  const channelIsArtist = artists.some((a) => a.length >= 3 && (channel.includes(a) || a.includes(channel)))
  if (cand.topic) score += channelIsArtist ? 30 : 10
  else if (channelIsArtist || cand.official || channel.endsWith("vevo")) score += 15

  // Títol: la cançó hi ha de sortir sencera (el títol de Spotify ja ve net de «Remastered»…)
  score += songTitle && containsPhrase(title, songTitle) ? 15 : -20

  const other = OTHER_VERSION.find((w) => containsPhrase(title, w) && !containsPhrase(songTitle, w)) ?? null
  if (other) score -= 40
  else if (LYRICS.some((w) => containsPhrase(title, w))) score -= 5

  // Desempat per popularitat: de 0 (≤ 1.000 visualitzacions) a +6 (≥ mil milions)
  if (cand.views) score += Math.max(0, Math.min(6, Math.log10(cand.views) - 3))

  return { ...cand, score: Math.round(score), delta_s: delta === null ? null : Math.round(delta), other_version: other }
}

export function confidenceOf(c: Pick<ScoredCandidate, "score" | "delta_s">): MatchConfidence {
  if (c.score >= 70 && c.delta_s !== null && Math.abs(c.delta_s) <= 8) return "high"
  if (c.score >= 40) return "medium"
  return "low"
}

/** Candidats ordenats de millor a pitjor, amb la confiança de cadascun. */
export function rankCandidates(track: MatchTrack, cands: YtCandidate[]): ScoredCandidate[] {
  return cands
    .map((c) => {
      const scored = scoreCandidate(track, c)
      return { ...scored, confidence: confidenceOf(scored) }
    })
    .sort((a, b) => b.score - a.score)
}
