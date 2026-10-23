import { NextResponse } from "next/server"
import { z } from "zod"
import { listPublicSongbooks, searchPublicSongbooks } from "@/db/queries/canconers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
})

/**
 * GET /api/songbooks/search?q=&limit=12 — només cançoners públics (l'overlay
 * d'inici de /app). Sense `q`, els més visitats.
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
    const limit = parsed.data.limit ?? 12
    const q = parsed.data.q?.trim() ?? ""
    const songbooks = q
      ? searchPublicSongbooks(q, limit)
      : listPublicSongbooks({ sort: "popular", page: 1, perPage: limit }).items
    return NextResponse.json({ songbooks })
  } catch (err) {
    console.error("[GET /api/songbooks/search]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
