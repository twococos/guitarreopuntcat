import type { CanconerEntry, CanconerSongRef, CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"

/**
 * Helper client per guardar un cançoner via POST /api/canconers.
 * Retorna l'id resultant, o null si hi ha error.
 */
export async function saveCanconer(
  title: string,
  style: CanconerStyle,
  accentColor: string | null,
  pdfOptions: PdfOptions,
  songs: CanconerSongRef[],
  existingId?: number | null,
): Promise<number | null> {
  try {
    const body: {
      title: string
      style: CanconerStyle
      accent_color: string | null
      pdf_options: PdfOptions
      songs: CanconerSongRef[]
      id?: number
    } = { title, style, accent_color: accentColor, pdf_options: pdfOptions, songs }
    if (existingId != null) body.id = existingId

    const res = await fetch("/api/canconers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { id: number }
    return data.id ?? null
  } catch {
    return null
  }
}

/** Entrades del cançoner → referències per desar-lo (o portar-lo a una altra pàgina). */
export function songRefs(entries: CanconerEntry[]): CanconerSongRef[] {
  return entries.map((e) => ({ id: e.song.id, semitones: e.semitones, arrangement: e.arrangement ?? null }))
}
