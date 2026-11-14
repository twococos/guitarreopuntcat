import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { getSongAccessRow } from "@/lib/access/songs"
import { chordSourceAddSchema, chordSourcePatchSchema } from "@/lib/schemas/transcriber"
import { parseChordSourceUrl } from "@/lib/transcriber/chordSourceSites"
import {
  addManualChordSource,
  listChordSources,
  removeManualChordSource,
  setChordSourceBlocked,
} from "@/db/queries/chordSources"
import { enqueueUpdates, songUpdateState } from "@/db/queries/transcriptions"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Fonts d'acords d'una cançó (tabs d'internet que contrasta el transcriptor, vegeu
 * src/db/queries/chordSources.ts). Els canvis tenen efecte a la propera anàlisi: amb
 * `reanalyze` se n'encua una d'`update` (com «Actualitza l'anàlisi»).
 *   · GET: llista, i si la cançó es pot tornar a analitzar.
 *   · POST `{ url }`: afegeix una URL a mà (si ja hi era, passa a manual i no descartada).
 *   · PATCH `{ url, blocked }`: descarta o recupera una font.
 *   · DELETE `?url=`: treu una font afegida a mà.
 * Totes les modificacions responen amb la llista nova (i `queued` si s'ha demanat `reanalyze`).
 */

type Ctx = { params: Promise<{ id: string }> }

async function songIdOf(params: Ctx["params"]): Promise<number | NextResponse> {
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
  if (!getSongAccessRow(id)) return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
  return id
}

function done(request: Request, userId: number, songId: number, action: string, reanalyze: boolean) {
  const queued = reanalyze ? enqueueUpdates([songId], userId) : undefined
  logEvent({
    type: "admin_action",
    request,
    userId,
    metadata: { action: `songs.chord_sources.${action}`, target_id: songId },
    status: 200,
  })
  return NextResponse.json({ sources: listChordSources(songId), ...songUpdateState(songId), queued })
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    const id = await songIdOf(params)
    if (id instanceof NextResponse) return id
    return NextResponse.json({ sources: listChordSources(id), ...songUpdateState(id) })
  } catch (err) {
    console.error("[GET /api/admin/songs/[id]/chord-sources]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    const id = await songIdOf(params)
    if (id instanceof NextResponse) return id

    const parsed = chordSourceAddSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    const source = parseChordSourceUrl(parsed.data.url)
    if (!source) {
      return NextResponse.json(
        { error: "Ha de ser una URL d'Ultimate Guitar, Cifra Club, E-Chords, LaCuerda, AcordesWeb, GuitarTuna o acordscatala" },
        { status: 400 },
      )
    }
    addManualChordSource(id, source.url, source.site)
    return done(request, auth.user.id, id, "add", parsed.data.reanalyze)
  } catch (err) {
    console.error("[POST /api/admin/songs/[id]/chord-sources]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    const id = await songIdOf(params)
    if (id instanceof NextResponse) return id

    const parsed = chordSourcePatchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    if (!setChordSourceBlocked(id, parsed.data.url, parsed.data.blocked)) {
      return NextResponse.json({ error: "Font no trobada" }, { status: 404 })
    }
    return done(request, auth.user.id, id, parsed.data.blocked ? "block" : "unblock", parsed.data.reanalyze)
  } catch (err) {
    console.error("[PATCH /api/admin/songs/[id]/chord-sources]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    const id = await songIdOf(params)
    if (id instanceof NextResponse) return id

    const search = new URL(request.url).searchParams
    const url = search.get("url")
    if (!url) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    if (!removeManualChordSource(id, url)) {
      return NextResponse.json({ error: "No és una font afegida a mà" }, { status: 404 })
    }
    return done(request, auth.user.id, id, "remove", search.get("reanalyze") === "1")
  } catch (err) {
    console.error("[DELETE /api/admin/songs/[id]/chord-sources]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
