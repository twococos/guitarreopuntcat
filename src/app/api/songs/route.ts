import { NextResponse } from "next/server"
import { songQuerySchema, songCreateSchema } from "@/lib/schemas/song"
import { listSongs, createSong, isValidOriginal } from "@/db/queries/songs"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { getSessionUser, requireAuth } from "@/lib/session"
import { SONG_STATE } from "@/lib/songKind"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Llista de /app: públiques + les pròpies (amb `kind`). */
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

    const songs = await listSongs(parsed.data, await getSessionUser())
    return NextResponse.json(songs)
  } catch (err) {
    console.error("[GET /api/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

/**
 * Crea una cançó. Els usuaris sempre en creen de privades (propietari = ells);
 * amb `original_song_id`, un arranjament d'una pública. Només l'admin en pot
 * crear de públiques directament (`visibility: "public"`).
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const body = await request.json()
    const parsed = songCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Falten camps obligatoris: title, artist, key, content" },
        { status: 400 },
      )
    }

    const { visibility, original_song_id, ...data } = parsed.data
    const input = { ...data, content: cleanupContent(data.content) }

    if (original_song_id != null && !isValidOriginal(original_song_id)) {
      return NextResponse.json({ error: "La cançó original no existeix o no és pública" }, { status: 400 })
    }

    const publish = visibility === "public" && user.role === "admin" && original_song_id == null
    const result = publish
      ? await createSong(input, { state: SONG_STATE.PUBLIC })
      : await createSong(input, {
          state: SONG_STATE.PRIVATE,
          ownerId: user.id,
          originalSongId: original_song_id ?? null,
        })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error("[POST /api/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
