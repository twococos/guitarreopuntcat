import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { resolveBodySchema } from "@/lib/schemas/import"
import { resolveSpotify } from "@/lib/spotify/resolve.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Cançons d'un enllaç de Spotify (cançó, llista, àlbum o artista). */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const parsed = resolveBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    const resolved = await resolveSpotify(parsed.data.input)
    if (!resolved) {
      return NextResponse.json({ error: "No s'ha pogut llegir l'enllaç de Spotify" }, { status: 404 })
    }
    return NextResponse.json(resolved)
  } catch (err) {
    console.error("[POST /api/admin/import/resolve]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
