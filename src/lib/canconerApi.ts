import type { CanconerStyle } from "@/types/song"

/**
 * Helper client per guardar un cançoner via POST /api/canconers.
 * Retorna l'id resultant, o null si hi ha error.
 */
export async function saveCanconer(
  title: string,
  style: CanconerStyle,
  accentColor: string | null,
  songs: Array<{ id: number; semitones: number }>,
  existingId?: number | null,
): Promise<number | null> {
  try {
    const body: {
      title: string
      style: CanconerStyle
      accent_color: string | null
      songs: Array<{ id: number; semitones: number }>
      id?: number
    } = { title, style, accent_color: accentColor, songs }
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
