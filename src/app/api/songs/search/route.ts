import { NextResponse } from "next/server"
import { z } from "zod"
import {
  searchPublicSongs,
  searchPublicArtists,
  listRecentPublicSongs,
} from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

/**
 * GET /api/songs/search
 *
 *   ?q=hall&limit=20  → cerca cançons i artistes que continguin "hall".
 *   ?q=                → retorna cançons recents (artistes buit).
 *
 * Resposta:
 *   { artists: Array<{ name, slug, song_count }>, songs: SongSummary[] }
 *
 * Públic. Només cançons amb `state = 0`.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    const q = parsed.data.q ?? ""
    const limit = parsed.data.limit ?? 20

    if (!q) {
      const songs = await listRecentPublicSongs(limit)
      return NextResponse.json({ artists: [], songs })
    }

    const [artists, songs] = await Promise.all([
      searchPublicArtists(q, limit),
      searchPublicSongs(q, limit),
    ])
    return NextResponse.json({ artists, songs })
  } catch (err) {
    console.error("[GET /api/songs/search]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
