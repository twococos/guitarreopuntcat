/**
 * Generació de slugs per a artistes i cançons.
 *
 * Els slugs es persisteixen a la BD (`songs.artist_slug` i `songs.song_slug`).
 * Un cop generats per a una cançó concreta, NO es regeneren encara que canviï
 * `artist` o `title` — així evitem trencar enllaços externs / SEO.
 *
 * Regles:
 *   · `artist_slug` és únic globalment (totes les cançons del mateix artista
 *     comparteixen el mateix slug). Imprescindible perquè la pàgina d'artista
 *     `/songs/[artist]` funcioni.
 *   · `(artist_slug, song_slug)` és únic per parella. Dues cançons d'un mateix
 *     artista amb mateix títol generen `-2`, `-3`, ...
 */

const CHAR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ñ: "n",
  Ñ: "n",
  ł: "l",
  Ł: "l",
  ø: "o",
  Ø: "o",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ß: "ss",
  "·": "",
  "&": " i ",
}

/**
 * Converteix un text en un slug URL-safe.
 *
 *   "L'Home Estàtic"     → "l-home-estatic"
 *   "Els Amics & Co"     → "els-amics-i-co"
 *   "Sopa  de  Cabra"    → "sopa-de-cabra"
 *   "Manel (Acústic)"    → "manel-acustic"
 *   "  Trim  "           → "trim"
 *
 * Si el resultat queda buit (ex.: només símbols), retorna `"untitled"`
 * com a darrer recurs. La situació no hauria de donar-se amb dades reals
 * (titles/artists tenen `min(1)` al schema Zod), però evitem un slug buit
 * que generaria URLs com `/songs//`.
 */
export function slugify(text: string): string {
  if (!text) return "untitled"

  let s = ""
  for (const ch of text) {
    s += CHAR_MAP[ch] ?? ch
  }

  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "")

  s = s.toLowerCase()

  s = s.replace(/[^a-z0-9]+/g, "-")

  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "")

  return s || "untitled"
}

/**
 * Donada una llista de slugs ja en ús, retorna el primer disponible afegint
 * `-2`, `-3`, ... si cal. Si `base` no està ocupat, el retorna tal qual.
 *
 *   resolveCollision("manel", ["manel"])           → "manel-2"
 *   resolveCollision("manel", ["manel", "manel-2"]) → "manel-3"
 *   resolveCollision("manel", [])                  → "manel"
 */
export function resolveCollision(base: string, taken: Iterable<string>): string {
  const takenSet = taken instanceof Set ? taken : new Set(taken)
  if (!takenSet.has(base)) return base
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`
    if (!takenSet.has(candidate)) return candidate
  }
  throw new Error(`No s'ha trobat slug disponible per a "${base}" (massa col·lisions)`)
}
