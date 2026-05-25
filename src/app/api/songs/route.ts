import { NextResponse } from "next/server"
import { songQuerySchema, songInputSchema } from "@/lib/schemas/song"
import { listSongs, createSong } from "@/db/queries/songs"
import { cleanupContent } from "@/lib/importers/cleanupContent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = songQuerySchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      artist: searchParams.get("artist") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    const songs = await listSongs(parsed.data)
    return NextResponse.json(songs)
  } catch (err) {
    console.error("[GET /api/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = songInputSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Falten camps obligatoris: title, artist, key, content" },
        { status: 400 },
      )
    }

    const input = { ...parsed.data, content: cleanupContent(parsed.data.content) }
    const result = await createSong(input)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error("[POST /api/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
