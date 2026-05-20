import { NextResponse } from "next/server"
import { songUpdateSchema } from "@/lib/schemas/song"
import { getSongById, updateSong, deleteSong } from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const song = await getSongById(id)
    if (!song) {
      return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
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
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const body = await request.json()
    const parsed = songUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const result = await updateSong(id, parsed.data)
    if (result.changes === 0) {
      return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
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
    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const result = await deleteSong(id)
    if (result.changes === 0) {
      return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
