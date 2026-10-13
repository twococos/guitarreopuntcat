import { NextResponse } from "next/server"
import { z } from "zod"
import { inArray } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { canconerStyleSchema } from "@/lib/schemas/canconer"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSessionUser } from "@/lib/session"

/**
 * Dades de les cançons per al generador de PDF del client
 * (src/lib/pdf-client). Retorna només el que cal per maquetar-les, en
 * l'ordre demanat, i registra l'event `pdf_download`.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  style: canconerStyleSchema.optional(),
  songs: z
    .array(
      z.object({
        id: z.number().int().positive(),
        semitones: z.number().int().default(0),
      }),
    )
    .min(1, "No has seleccionat cap cançó")
    .max(1000),
})

export async function POST(request: Request) {
  const startedAt = Date.now()
  const sessionUser = await getSessionUser()

  let parsed
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Petició invàlida"
    return NextResponse.json({ error: msg ?? "Petició invàlida" }, { status: 400 })
  }

  const ids = Array.from(new Set(parsed.songs.map((s) => s.id)))
  const rows = db.select().from(schema.songs).where(inArray(schema.songs.id, ids)).all()
  const byId = new Map(rows.map((r) => [r.id, r]))

  const songs = parsed.songs.flatMap(({ id, semitones }) => {
    const s = byId.get(id)
    if (!s) return []
    return [
      {
        title: s.title,
        artist: s.artist,
        key: s.key,
        capo: s.capo,
        content: s.content,
        semitones,
        album: s.album,
        year: s.year,
        youtube_url: s.youtubeUrl,
        spotify_url: s.spotifyUrl,
      },
    ]
  })

  if (songs.length === 0) {
    return NextResponse.json({ error: "Cap cançó vàlida" }, { status: 400 })
  }

  logEvent({
    type: "pdf_download",
    request,
    userId: sessionUser?.id ?? null,
    metadata: {
      songs_count: songs.length,
      style: parsed.style,
      success: true,
      engine: "client",
    },
    status: 200,
    durationMs: Date.now() - startedAt,
  })

  return NextResponse.json({ songs })
}
