import "server-only"
import { searchYoutube } from "@/lib/youtube/search.server"

/**
 * Cerca el primer vídeo de YouTube que coincideixi amb `{artist} {title}` fent
 * scrape de la pàgina pública de resultats (no usa Data API → no requereix
 * cap clau). Vegeu src/lib/youtube/searchResults.ts.
 *
 * Torna el primer resultat orgànic (YouTube ordena per relevància — pot
 * incloure vídeos oficials, covers, lyric videos, etc.; no garanteix qualitat).
 * La pestanya «Importar cançons» fa servir `findYoutubeMatch`, que tria per
 * durada i canal.
 *
 * Si no hi ha cap match (pàgina de captcha, sense resultats, format canviat)
 * retornem null. Mai llencem excepció: el cridador tracta null com a
 * "no trobat" i continua amb la següent fila.
 */
export async function findYoutubeUrl(
  artist: string,
  title: string,
): Promise<string | null> {
  const results = await searchYoutube(`${artist} ${title}`)
  const first = results?.[0]
  return first ? `https://www.youtube.com/watch?v=${first.video_id}` : null
}
