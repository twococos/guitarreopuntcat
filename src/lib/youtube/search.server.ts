import "server-only"
import { parseSearchResults, type YtCandidate } from "./searchResults"
import { rankCandidates, type MatchTrack, type ScoredCandidate } from "./match"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Resultats de la cerca pública de YouTube (scrape, sense clau d'API).
 * Null si la petició falla (captcha, temps límit…). Mai llença.
 */
export async function searchYoutube(query: string): Promise<YtCandidate[] | null> {
  const q = query.trim()
  if (!q) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ca;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    })
    if (!res.ok) return null
    return parseSearchResults(await res.text())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface YoutubeMatch {
  /** Els millors candidats, de millor a pitjor (com a molt 5). */
  candidates: ScoredCandidate[]
  /** Null si YouTube no ha respost. */
  error: boolean
}

const MAX_CANDIDATES = 5

/**
 * Vídeo de YouTube per a una cançó: cerca «artista títol» i, si cap resultat no
 * és prou segur, una segona cerca afegint «audio» (fa sortir els canals «- Topic»
 * i els vídeos només d'àudio, que solen ser la versió d'estudi).
 */
export async function findYoutubeMatch(track: MatchTrack): Promise<YoutubeMatch> {
  const base = `${track.artists[0] ?? ""} ${track.title}`.trim()
  const first = await searchYoutube(base)
  let pool = first ?? []
  let ranked = rankCandidates(track, pool)
  if (ranked[0]?.confidence !== "high") {
    const second = await searchYoutube(`${base} audio`)
    if (second) {
      const seen = new Set(pool.map((c) => c.video_id))
      pool = [...pool, ...second.filter((c) => !seen.has(c.video_id))]
      ranked = rankCandidates(track, pool)
    }
    if (!first && !second) return { candidates: [], error: true }
  }
  return { candidates: ranked.slice(0, MAX_CANDIDATES), error: false }
}
