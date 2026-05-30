import "server-only"

/**
 * Cerca el primer vídeo de YouTube que coincideixi amb `{artist} {title}` fent
 * scrape de la pàgina pública de resultats (no usa Data API → no requereix
 * cap clau).
 *
 * Com funciona:
 *  1. GET https://www.youtube.com/results?search_query=...
 *     amb User-Agent realista. YouTube respon amb HTML que inclou un blob
 *     enorme `var ytInitialData = { ... };` dins un <script>.
 *  2. Extraiem el primer videoId que apareix al blob. Aquest sempre és el
 *     primer resultat orgànic (YouTube ordena per relevància — pot incloure
 *     vídeos oficials, covers, lyric videos, etc.; no garanteix qualitat).
 *  3. Tornem la URL canònica https://www.youtube.com/watch?v={id}.
 *
 * Si no hi ha cap match (pàgina de captcha, sense resultats, format canviat)
 * retornem null. Mai llencem excepció: el cridador tracta null com a
 * "no trobat" i continua amb la següent fila.
 */
export async function findYoutubeUrl(
  artist: string,
  title: string,
): Promise<string | null> {
  const query = `${artist} ${title}`.trim()
  if (!query) return null

  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ca;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    })
    if (!res.ok) return null
    const html = await res.text()
    return extractFirstVideoId(html)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * El primer "videoId":"XXXXXXXXXXX" del HTML correspon al primer resultat
 * orgànic. Hi ha videoIds també dins d'altres seccions (related, shelves)
 * però el primer ocorrent sempre és el top hit perquè ytInitialData els
 * emet en ordre de presentació.
 */
function extractFirstVideoId(html: string): string | null {
  const m = /"videoId":"([A-Za-z0-9_-]{11})"/.exec(html)
  if (!m) return null
  return `https://www.youtube.com/watch?v=${m[1]}`
}
