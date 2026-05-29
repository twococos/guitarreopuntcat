import { NextResponse } from "next/server"
import { z } from "zod"
import { getRandomPublicSongs } from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  exclude: z.array(z.coerce.number().int().positive()).optional(),
  count: z.coerce.number().int().min(1).max(20).optional(),
})

/**
 * GET /api/songs/random
 *
 *   ?exclude=12&exclude=34  → exclou aquests ids
 *   ?count=3                → retorna fins a 3 cançons
 *
 * Resposta: { songs: SongSummary[] } (ordenat al·leatòriament)
 *
 * Per compatibilitat manté també `song` (la primera) al payload.
 *
 * Públic. Usat per la secció "Inspira't" de la portada per tornar a tirar el
 * dau sense recarregar.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      exclude: searchParams.getAll("exclude"),
      count: searchParams.get("count") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    const count = parsed.data.count ?? 1
    const songs = await getRandomPublicSongs(count, parsed.data.exclude ?? [])
    return NextResponse.json({ songs, song: songs[0] ?? null })
  } catch (err) {
    console.error("[GET /api/songs/random]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
