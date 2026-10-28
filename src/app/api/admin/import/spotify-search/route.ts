import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { isSpotifyConfigured } from "@/lib/spotify/client.server"
import { searchTracks } from "@/lib/spotify/resolve.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cerca de cançons a Spotify (`?q=`, com a molt 10 resultats). */
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    if (!isSpotifyConfigured()) return NextResponse.json({ configured: false, tracks: [] })
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200)
    if (!q) return NextResponse.json({ configured: true, tracks: [] })
    const tracks = await searchTracks(q)
    if (!tracks) return NextResponse.json({ error: "Spotify no ha respost" }, { status: 502 })
    return NextResponse.json({ configured: true, tracks })
  } catch (err) {
    console.error("[GET /api/admin/import/spotify-search]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
