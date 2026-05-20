import { NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { transposeContent, transposeKey } from "@/lib/transpose"
import { buildHtml, type PdfSong } from "@/lib/pdf/buildHtml"
import { generatePdf } from "@/lib/pdf/generate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const pdfBodySchema = z.object({
  title: z.string().default("El meu cançoner"),
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
  let parsed
  try {
    parsed = pdfBodySchema.parse(await request.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Petició invàlida"
    return NextResponse.json({ error: msg ?? "Petició invàlida" }, { status: 400 })
  }

  // Carregar cançons de la BD i aplicar transposició
  const pdfSongs: PdfSong[] = []
  for (const { id, semitones } of parsed.songs) {
    const song = db.select().from(schema.songs).where(eq(schema.songs.id, id)).get()
    if (!song) continue
    pdfSongs.push({
      title: song.title,
      artist: song.artist,
      displayKey: transposeKey(song.key, semitones),
      capo: song.capo,
      content: transposeContent(song.content, semitones),
    })
  }

  if (pdfSongs.length === 0) {
    return NextResponse.json({ error: "Cap cançó vàlida" }, { status: 400 })
  }

  try {
    const html = buildHtml(parsed.title, pdfSongs)
    const pdfBuffer = await generatePdf(html)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="canconer.pdf"`,
      },
    })
  } catch (err) {
    console.error("PDF generation error:", err)
    return NextResponse.json({ error: "Error generant el PDF" }, { status: 500 })
  }
}
