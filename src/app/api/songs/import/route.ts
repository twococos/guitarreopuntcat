/** Route handler per importar una cançó a partir d'una URL externa suportada. */

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/session"
import { findImporter } from "@/lib/importers/registry.server"
import { normalizeSectionTitles } from "@/lib/importers/normalizeSections"
import { cleanupContent } from "@/lib/importers/cleanupContent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  url: z.string().url(),
})

export async function POST(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth()
  if (authResult instanceof NextResponse) return authResult
  const { user } = authResult

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Només els administradors poden importar cançons." },
      { status: 403 },
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "URL no vàlida." }, { status: 400 })
  }

  const { url } = parsed.data

  const imp = findImporter(url)
  if (!imp) {
    return NextResponse.json(
      { error: "Aquesta web no està suportada." },
      { status: 400 },
    )
  }

  let html: string
  try {
    html = await imp.fetch(url)
  } catch (err) {
    console.error("[POST /api/songs/import] fetch error:", err)
    return NextResponse.json(
      { error: "No s'ha pogut descarregar la pàgina." },
      { status: 502 },
    )
  }

  let result
  try {
    result = imp.parse(html, url)
  } catch (err) {
    console.error("[POST /api/songs/import] parse error:", err)
    return NextResponse.json(
      { error: "No s'ha pogut analitzar la pàgina." },
      { status: 500 },
    )
  }

  // Normalitza els noms de seccions cap als tipus permesos (Estrofa, Tornada,
  // Pont, Outro…) i renumera les estrofes en ordre d'aparició. Després
  // col·lapsa línies en blanc i garanteix un mínim d'espai entre acords
  // consecutius a línies només-acords.
  const normalized = normalizeSectionTitles(result.content)
  result = { ...result, content: cleanupContent(normalized) }

  return NextResponse.json(result)
}
