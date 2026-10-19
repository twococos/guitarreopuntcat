import { NextResponse } from "next/server"
import { z } from "zod"
import { getRandomPublicSongbooks } from "@/db/queries/canconers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  exclude: z.array(z.coerce.number().int().positive()).optional(),
  count: z.coerce.number().int().min(1).max(12).optional(),
})

/**
 * GET /api/songbooks/random?count=3&exclude=12 — cançoners públics a l'atzar
 * per a la secció "Cançoners per descobrir" de la portada.
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
    const songbooks = getRandomPublicSongbooks(parsed.data.count ?? 3, parsed.data.exclude ?? [])
    return NextResponse.json({ songbooks })
  } catch (err) {
    console.error("[GET /api/songbooks/random]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
