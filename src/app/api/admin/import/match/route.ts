import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { matchBodySchema } from "@/lib/schemas/import"
import { isSpotifyConfigured } from "@/lib/spotify/client.server"
import { getTrack } from "@/lib/spotify/resolve.server"
import { cleanTrackTitle, type SpotifyTrack } from "@/lib/spotify/url"
import { findYoutubeMatch } from "@/lib/youtube/search.server"
import { findExistingSongByArtistTitle } from "@/db/queries/proposals"
import { findActiveJobByArtistTitle, findJobForVideo } from "@/db/queries/transcriptions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cançons que es processen alhora (cada una fa 1-2 cerques a YouTube i potser una crida a Spotify). */
const CONCURRENCY = 3

async function matchOne(input: SpotifyTrack) {
  // Les cançons de llistes i artistes (reproductor incrustat) no porten àlbum ni any
  const track = input.album === null && isSpotifyConfigured() ? ((await getTrack(input.spotify_id)) ?? input) : input
  const title = cleanTrackTitle(track.title)
  const artist = track.artists[0] ?? ""
  const match = await findYoutubeMatch({ title, artists: track.artists, duration_ms: track.duration_ms })

  // Feines que ja hi ha per a cada vídeo candidat (l'admin pot triar-ne un altre)
  const existingJobs: Record<string, { id: number; status: string }> = {}
  for (const c of match.candidates) {
    const job = findJobForVideo(c.video_id)
    if (job) existingJobs[c.video_id] = { id: job.id, status: job.status }
  }
  const duplicate = artist
    ? (findExistingSongByArtistTitle(artist, title) ?? findExistingSongByArtistTitle(artist, track.title))
    : null

  return {
    track,
    title,
    artist,
    candidates: match.candidates,
    youtube_error: match.error,
    duplicate_song_id: duplicate?.id ?? null,
    queued_job: artist ? findActiveJobByArtistTitle(artist, title) : null,
    existing_jobs: existingJobs,
  }
}

/**
 * Per a cada cançó de Spotify: metadades completes, vídeos de YouTube candidats
 * (de millor a pitjor) i si ja existeix o ja és a la cua. El client en demana
 * lots petits perquè la llista de revisió es vagi omplint.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const parsed = matchBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    const tracks = parsed.data.tracks
    const results: Awaited<ReturnType<typeof matchOne>>[] = new Array(tracks.length)
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, async () => {
        while (next < tracks.length) {
          const i = next++
          results[i] = await matchOne(tracks[i])
        }
      }),
    )
    return NextResponse.json({ results })
  } catch (err) {
    console.error("[POST /api/admin/import/match]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
