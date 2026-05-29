import { NextResponse } from "next/server"
import { z } from "zod"
import {
  getPublicSongsByLetter,
  getPublicArtistsByLetter,
} from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  by: z.enum(["letter", "artist"]).default("letter"),
})

/**
 * GET /api/songs/index
 *
 *   ?by=letter  (default) → cançons agrupades per inicial del títol.
 *   ?by=artist            → artistes (deduplicats) agrupats per inicial del nom.
 *
 * Resposta `by=letter`:
 *   { "A": [{ id, title, artist, artist_slug, song_slug, key }, ...], ... }
 *
 * Resposta `by=artist`:
 *   { "A": [{ name, slug, song_count }, ...], ... }
 *
 * Públic. Només cançons amb `state = 0`.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      by: searchParams.get("by") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    if (parsed.data.by === "artist") {
      const data = await getPublicArtistsByLetter()
      return NextResponse.json(data)
    }

    const data = await getPublicSongsByLetter()
    return NextResponse.json(data)
  } catch (err) {
    console.error("[GET /api/songs/index]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
