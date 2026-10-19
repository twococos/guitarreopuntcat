import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { listOwnPrivateSongs } from "@/db/queries/songs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/me/songs — privades i arranjaments de l'usuari (Biblioteca › Les meves cançons). */
export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    return NextResponse.json(listOwnPrivateSongs(authResult.user.id))
  } catch (err) {
    console.error("[GET /api/me/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
