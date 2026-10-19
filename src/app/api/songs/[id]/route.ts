import { NextResponse } from "next/server"
import { songUpdateSchema } from "@/lib/schemas/song"
import { getSongById, updateSong, deleteSong } from "@/db/queries/songs"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { getSessionUser, requireAuth } from "@/lib/session"
import {
  canDeleteSong,
  canEditSong,
  canViewSong,
  getSongAccessRow,
  type SongbookContext,
} from "@/lib/access/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOT_FOUND = { error: "Cançó no trobada" }

/** Context de cançoner opcional (?songbook=ID o ?token=...) per a la regla 5 d'accés. */
function contextFrom(request: Request): SongbookContext | undefined {
  const sp = new URL(request.url).searchParams
  const token = sp.get("token")
  if (token) return { shareToken: token }
  const songbook = Number(sp.get("songbook"))
  if (Number.isInteger(songbook) && songbook > 0) return { songbookId: songbook }
  return undefined
}

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id: rawId } = await params
  const id = Number(rawId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await parseId(params)
    if (id === null) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const access = getSongAccessRow(id)
    // 404 també si no la pot veure: no revelem que existeix
    if (!access || !canViewSong(access, await getSessionUser(), contextFrom(request))) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    const song = await getSongById(id)
    if (!song) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    return NextResponse.json(song)
  } catch (err) {
    console.error("[GET /api/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const id = await parseId(params)
    if (id === null) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const access = getSongAccessRow(id)
    if (!access || !canViewSong(access, user)) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }
    if (!canEditSong(access, user)) {
      return NextResponse.json({ error: "No autoritzat" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = songUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const update =
      parsed.data.content !== undefined
        ? { ...parsed.data, content: cleanupContent(parsed.data.content) }
        : parsed.data
    const result = await updateSong(id, update)
    if (result.changes === 0) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PUT /api/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const id = await parseId(params)
    if (id === null) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const access = getSongAccessRow(id)
    if (!access || !canViewSong(access, user)) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }
    if (!canDeleteSong(access, user)) {
      return NextResponse.json({ error: "No autoritzat" }, { status: 403 })
    }

    const result = await deleteSong(id)
    if (result.changes === 0) {
      return NextResponse.json(NOT_FOUND, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
