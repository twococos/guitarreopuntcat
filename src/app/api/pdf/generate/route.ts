import { NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { buildHtml, type PdfSong } from "@/lib/pdf/buildHtml"
import { generatePdf } from "@/lib/pdf/generate"
import {
  canconerStyleSchema,
  accentColorSchema,
  pdfOptionsSchema,
  PDF_OPTIONS_DEFAULTS,
} from "@/lib/schemas/canconer"
import { logEvent } from "@/lib/analytics/logEvent"
import { getSessionUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const pdfBodySchema = z.object({
  title: z.string().default("El meu cançoner"),
  style: canconerStyleSchema,
  accent_color: accentColorSchema,
  pdf_options: pdfOptionsSchema.default(PDF_OPTIONS_DEFAULTS),
  songs: z
    .array(
      z.object({
        id: z.number().int().positive(),
        semitones: z.number().int().default(0),
      }),
    )
    .min(1, "No has seleccionat cap cançó"),
})

export async function POST(request: Request) {
  const startedAt = Date.now()
  const sessionUser = await getSessionUser()
  const userId = sessionUser?.id ?? null

  let parsed
  try {
    parsed = pdfBodySchema.parse(await request.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Peticio invalida"
    return NextResponse.json({ error: msg ?? "Peticio invalida" }, { status: 400 })
  }

  // Carregar cançons de la BD. La transposicio s'aplica al render
  // (renderSongHtml) per coherencia amb el component <SongView />.
  const pdfSongs: PdfSong[] = []
  for (const { id, semitones } of parsed.songs) {
    const song = db.select().from(schema.songs).where(eq(schema.songs.id, id)).get()
    if (!song) continue
    pdfSongs.push({
      title: song.title,
      artist: song.artist,
      key: song.key,
      capo: song.capo,
      content: song.content,
      semitones,
      album: song.album,
      year: song.year,
      youtubeUrl: song.youtubeUrl,
      spotifyUrl: song.spotifyUrl,
    })
  }

  if (pdfSongs.length === 0) {
    return NextResponse.json({ error: "Cap canco valida" }, { status: 400 })
  }

  try {
    const html = await buildHtml(parsed.title, parsed.style, parsed.accent_color, pdfSongs, parsed.pdf_options)
    const pdfBuffer = await generatePdf(
      html,
      parsed.pdf_options,
      parsed.title,
      parsed.pdf_options.show_cover,
      parsed.style,
      parsed.accent_color,
    )
    logEvent({
      type: "pdf_download",
      request,
      userId,
      metadata: {
        songs_count: pdfSongs.length,
        style: parsed.style,
        success: true,
      },
      status: 200,
      durationMs: Date.now() - startedAt,
    })
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="canconer.pdf"`,
      },
    })
  } catch (err) {
    console.error("PDF generation error:", err)
    logEvent({
      type: "pdf_download",
      request,
      userId,
      metadata: { songs_count: pdfSongs.length, success: false },
      status: 500,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ error: "Error generant el PDF" }, { status: 500 })
  }
}
