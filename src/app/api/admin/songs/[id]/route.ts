import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { changeSongKind, changeSongOwner, isValidOriginal } from "@/db/queries/songs"
import { userExists } from "@/db/queries/admin"
import { moveSongToProposals } from "@/db/queries/proposals"
import { getSongAccessRow } from "@/lib/access/songs"
import { SONG_STATE } from "@/lib/songKind"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  kind: z.enum(["public", "private", "arrangement", "proposal"]).optional(),
  owner_id: z.number().int().positive().optional(),
  original_song_id: z.number().int().positive().optional(),
})

/**
 * PATCH /api/admin/songs/[id] — canvia el tipus i/o el propietari.
 *   · `kind: "public"`: sense propietari ni original; rep slugs si no en té.
 *   · `kind: "private"`: propietari = `owner_id`, l'actual, o l'admin.
 *   · `kind: "arrangement"`: cal `original_song_id` (una pública que no sigui ella).
 *   · `kind: "proposal"`: torna a la cua de propostes, a nom del propietari.
 *   · Només `owner_id`: canvia el propietari d'una privada o arranjament.
 * Les propostes pendents no es toquen aquí.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }
    const { kind, owner_id, original_song_id } = parsed.data

    const song = getSongAccessRow(id)
    if (!song) return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
    if (song.state === SONG_STATE.PENDING) {
      return NextResponse.json({ error: "Les propostes es revisen a la pestanya de propostes" }, { status: 400 })
    }
    if (owner_id !== undefined && !userExists(owner_id)) {
      return NextResponse.json({ error: "L'usuari no existeix" }, { status: 400 })
    }

    const ownerId = owner_id ?? song.ownerId ?? user.id
    if (kind === "public") {
      changeSongKind(id, { kind: "public" })
    } else if (kind === "private") {
      changeSongKind(id, { kind: "private", ownerId })
    } else if (kind === "proposal") {
      const r = moveSongToProposals(id, ownerId)
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status })
    } else if (kind === "arrangement") {
      if (original_song_id === undefined || !isValidOriginal(original_song_id, id)) {
        return NextResponse.json({ error: "Cal triar una cançó pública com a original" }, { status: 400 })
      }
      changeSongKind(id, { kind: "arrangement", ownerId, originalSongId: original_song_id })
    } else if (owner_id !== undefined) {
      if (changeSongOwner(id, owner_id).changes === 0) {
        return NextResponse.json({ error: "Només les privades tenen propietari" }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: "No hi ha cap canvi" }, { status: 400 })
    }

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: `songs.${kind ?? "owner"}`, target_id: id },
      status: 200,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/admin/songs/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
