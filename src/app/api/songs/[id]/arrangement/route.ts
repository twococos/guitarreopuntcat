import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { songInputSchema } from "@/lib/schemas/song"
import { createSong, isValidOriginal } from "@/db/queries/songs"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { SONG_STATE } from "@/lib/songKind"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/songs/[id]/arrangement — desa el contingut del body com a
 * arranjament privat de la cançó pública `id` (propietari = qui el desa).
 * L'original no es toca. Ho fan servir l'admin ("Desa com a arranjament") i
 * els usuaris que editen una pública ("Desa la meva versió").
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }
    if (!isValidOriginal(id)) {
      return NextResponse.json({ error: "Només es poden arranjar cançons públiques" }, { status: 400 })
    }

    const parsed = songInputSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const result = await createSong(
      { ...parsed.data, content: cleanupContent(parsed.data.content) },
      { state: SONG_STATE.PRIVATE, ownerId: user.id, originalSongId: id },
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error("[POST /api/songs/[id]/arrangement]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
