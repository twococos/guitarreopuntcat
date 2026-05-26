/**
 * Extreu l'ID de vídeo d'una URL de YouTube (youtube.com, youtu.be, /embed/).
 * Retorna null si la URL no és vàlida o no conté ID identificable.
 */
export function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0]
      return id || null
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v")
      if (v) return v
      const m = u.pathname.match(/\/embed\/([^/?]+)/)
      return m?.[1] ?? null
    }
  } catch {
    // URL invàlida
  }
  return null
}
