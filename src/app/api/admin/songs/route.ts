import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { countSongsByKind, listSongsForAdmin } from "@/db/queries/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  kind: z.enum(["all", "public", "private", "arrangement"]).default("all"),
  analysis: z.enum(["any", "none", "bad"]).default("any"),
  search: z.string().trim().max(100).optional(),
})

/**
 * GET /api/admin/songs?kind=&analysis=&search= — cançons del panell d'admin
 * (sense propostes pendents) amb tipus, propietari, original i anàlisi.
 * `search` accepta també `#123` per buscar per id.
 */
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult

    const sp = new URL(request.url).searchParams
    const parsed = querySchema.safeParse({
      kind: sp.get("kind") ?? undefined,
      analysis: sp.get("analysis") ?? undefined,
      search: sp.get("search") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Paràmetres invàlids" }, { status: 400 })
    }

    return NextResponse.json({
      songs: listSongsForAdmin(parsed.data),
      counts: countSongsByKind(),
    })
  } catch (err) {
    console.error("[GET /api/admin/songs]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
