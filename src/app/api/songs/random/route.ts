import { NextResponse } from "next/server"
import { z } from "zod"
import { getRandomPublicSong } from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  exclude: z.coerce.number().int().positive().optional(),
})

/**
 * GET /api/songs/random
 *
 *   ?exclude=12  → retorna una cançó pública al·leatòria diferent de la id 12.
 *
 * Resposta: { song: SongSummary | null }
 *
 * Públic. Usat per la secció "Inspira't" de la portada per tornar a tirar el
 * dau sense recarregar.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      exclude: searchParams.get("exclude") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    const song = await getRandomPublicSong(parsed.data.exclude)
    return NextResponse.json({ song })
  } catch (err) {
    console.error("[GET /api/songs/random]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
