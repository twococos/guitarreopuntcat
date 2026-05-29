import { eq, like, or, asc, desc, and, sql, isNotNull, count } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { mapSong, mapSongSummary } from "./utils"
import { slugify, resolveCollision } from "@/lib/slugify"
import type { SongQuery } from "@/lib/schemas/song"

// Camps que disparen actualització de updated_at en fer updateSong.
// `state` no està a la llista: només volem traçar canvis de contingut.
const SONG_CONTENT_KEYS = [
  "title", "artist", "key", "capo", "content", "language", "tags",
  "album", "year", "youtubeUrl", "spotifyUrl",
] as const

// ─── GET /api/songs ──────────────────────────────────────────

export async function listSongs(query: SongQuery) {
  const { search, artist, sortBy, order } = query

  const conditions = [eq(schema.songs.state, 0)]

  if (search) {
    conditions.push(
      or(
        like(schema.songs.title, `%${search}%`),
        like(schema.songs.artist, `%${search}%`),
      )!,
    )
  }

  if (artist) {
    conditions.push(like(schema.songs.artist, `%${artist}%`))
  }

  const col = (() => {
    switch (sortBy) {
      case "artist":
        return schema.songs.artist
      case "key":
        return schema.songs.key
      case "created_at":
        return schema.songs.createdAt
      default:
        return schema.songs.title
    }
  })()

  const orderExpr = order === "DESC" ? desc(col) : asc(col)

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(and(...conditions))
    .orderBy(orderExpr)

  return rows.map(mapSongSummary)
}

// ─── GET /api/songs/[id] ─────────────────────────────────────

export async function getSongById(id: number) {
  const [song] = await db
    .select()
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .limit(1)

  if (!song) return null
  return mapSong(song)
}

// ─── Slugs ───────────────────────────────────────────────────

function normalizeArtistKey(artist: string): string {
  return artist
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/**
 * Calcula `artist_slug` i `song_slug` per a una cançó nova. Reutilitza
 * l'`artist_slug` existent si ja hi ha cançons del mateix artista (clau
 * normalitzada); en cas contrari en genera un de nou i resol col·lisions
 * globals. Per `song_slug`, resol col·lisions dins l'artista.
 *
 * Exportat perquè `createProposal` també l'utilitza.
 */
export function generateSlugsForNewSong(
  artist: string,
  title: string,
): { artistSlug: string; songSlug: string } {
  const artistKey = normalizeArtistKey(artist)

  const existing = db
    .select({ artist: schema.songs.artist, artistSlug: schema.songs.artistSlug })
    .from(schema.songs)
    .where(isNotNull(schema.songs.artistSlug))
    .all()

  let artistSlug: string | undefined
  const usedArtistSlugs = new Set<string>()
  for (const row of existing) {
    if (row.artistSlug) {
      usedArtistSlugs.add(row.artistSlug)
      if (!artistSlug && normalizeArtistKey(row.artist) === artistKey) {
        artistSlug = row.artistSlug
      }
    }
  }

  if (!artistSlug) {
    artistSlug = resolveCollision(slugify(artist), usedArtistSlugs)
  }

  const sameArtistSongs = db
    .select({ songSlug: schema.songs.songSlug })
    .from(schema.songs)
    .where(eq(schema.songs.artistSlug, artistSlug))
    .all()
  const usedSongSlugs = new Set<string>()
  for (const row of sameArtistSongs) {
    if (row.songSlug) usedSongSlugs.add(row.songSlug)
  }

  const songSlug = resolveCollision(slugify(title), usedSongSlugs)
  return { artistSlug, songSlug }
}

// ─── POST /api/songs ─────────────────────────────────────────

export async function createSong(data: {
  title: string
  artist: string
  key: string
  capo: number
  content: string
  language: string
  tags: string
  album?: string | null
  year?: number | null
  youtubeUrl?: string | null
  spotifyUrl?: string | null
}) {
  const { artistSlug, songSlug } = generateSlugsForNewSong(data.artist, data.title)

  const result = db
    .insert(schema.songs)
    .values({
      title: data.title,
      artist: data.artist,
      artistSlug,
      songSlug,
      key: data.key,
      capo: data.capo,
      content: data.content,
      language: data.language,
      tags: data.tags,
      album: data.album ?? null,
      year: data.year ?? null,
      youtubeUrl: data.youtubeUrl ?? null,
      spotifyUrl: data.spotifyUrl ?? null,
      state: 0,
    })
    .run()

  return { id: Number(result.lastInsertRowid) }
}

// ─── PUT /api/songs/[id] ─────────────────────────────────────

export async function updateSong(
  id: number,
  data: Partial<{
    title: string
    artist: string
    key: string
    capo: number
    content: string
    language: string
    tags: string
    album: string | null
    year: number | null
    youtubeUrl: string | null
    spotifyUrl: string | null
    state: number
  }>,
) {
  const touchesContent = SONG_CONTENT_KEYS.some((k) => k in data)
  const updates = touchesContent
    ? { ...data, updatedAt: sql`(datetime('now'))` }
    : data

  const result = db
    .update(schema.songs)
    .set(updates)
    .where(eq(schema.songs.id, id))
    .run()

  return { changes: result.changes }
}

// ─── DELETE /api/songs/[id] ──────────────────────────────────

export async function deleteSong(id: number) {
  const result = db
    .delete(schema.songs)
    .where(eq(schema.songs.id, id))
    .run()

  return { changes: result.changes }
}

// ─── Cerca pública (Fase 3) ──────────────────────────────────

/**
 * Cerca cançons públiques (state=0) per `title` o `artist`.
 *
 * Estratègia anti-diacrítics: cerquem tant en els camps textuals com en els
 * slugs (que ja són ASCII), perquè un usuari que escriu "canco" trobi
 * "Cançó". El terme es passa per `slugify` per generar la versió ASCII.
 */
export async function searchPublicSongs(q: string, limit: number) {
  const trimmed = q.trim()
  if (!trimmed) return []

  const like1 = `%${trimmed}%`
  const slugQ = `%${slugify(trimmed)}%`

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
        or(
          like(schema.songs.title, like1),
          like(schema.songs.artist, like1),
          like(schema.songs.artistSlug, slugQ),
          like(schema.songs.songSlug, slugQ),
        )!,
      ),
    )
    .orderBy(asc(schema.songs.artist), asc(schema.songs.title))
    .limit(limit)

  return rows.map(mapSongSummary)
}

/**
 * Cerca artistes (deduplicats per `artist_slug`) amb comptador de cançons.
 * Inclou la cerca per slug per cobrir variants amb/sense diacrítics.
 */
export async function searchPublicArtists(q: string, limit: number) {
  const trimmed = q.trim()
  if (!trimmed) return []

  const like1 = `%${trimmed}%`
  const slugQ = `%${slugify(trimmed)}%`

  const rows = await db
    .select({
      name: schema.songs.artist,
      slug: schema.songs.artistSlug,
      song_count: count(schema.songs.id),
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        or(like(schema.songs.artist, like1), like(schema.songs.artistSlug, slugQ))!,
      ),
    )
    .groupBy(schema.songs.artistSlug)
    .orderBy(asc(schema.songs.artist))
    .limit(limit)

  return rows
    .filter((r): r is { name: string; slug: string; song_count: number } => r.slug !== null)
    .map((r) => ({ name: r.name, slug: r.slug, song_count: r.song_count }))
}

/** Cançons més recents (públiques). Usat com a fallback de la cerca quan `q` és buit. */
export async function listRecentPublicSongs(limit: number) {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )
    .orderBy(desc(schema.songs.createdAt))
    .limit(limit)

  return rows.map(mapSongSummary)
}

/**
 * Una cançó pública al·leatòria, opcionalment excloent un id (per re-tirar
 * el dau sense repetir el mateix resultat). Si no n'hi ha cap, retorna null.
 *
 * Usa `ORDER BY RANDOM()` de SQLite — barat fins a milers de files.
 */
export async function getRandomPublicSong(excludeId?: number) {
  const conditions = [
    eq(schema.songs.state, 0),
    isNotNull(schema.songs.artistSlug),
    isNotNull(schema.songs.songSlug),
  ]
  if (excludeId !== undefined && Number.isFinite(excludeId)) {
    conditions.push(sql`${schema.songs.id} <> ${excludeId}`)
  }

  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
    })
    .from(schema.songs)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(1)

  return rows[0] ? mapSongSummary(rows[0]) : null
}

/**
 * Índex de cançons agrupades per inicial del títol. Retorna `{ A: [...], B: [...] }`.
 * Caràcters no alfanumèrics o numèrics s'agrupen com a "#".
 */
export async function getPublicSongsByLetter() {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )
    .orderBy(asc(schema.songs.title))

  const groups: Record<string, Array<{
    id: number
    title: string
    artist: string
    artist_slug: string
    song_slug: string
    key: string
  }>> = {}

  for (const r of rows) {
    if (!r.artistSlug || !r.songSlug) continue
    const initial = initialLetterOf(r.title)
    if (!groups[initial]) groups[initial] = []
    groups[initial].push({
      id: r.id,
      title: r.title,
      artist: r.artist,
      artist_slug: r.artistSlug,
      song_slug: r.songSlug,
      key: r.key,
    })
  }

  return groups
}

/**
 * Índex d'artistes agrupats per inicial del nom. Retorna `{ A: [...], B: [...] }`.
 */
export async function getPublicArtistsByLetter() {
  const rows = await db
    .select({
      name: schema.songs.artist,
      slug: schema.songs.artistSlug,
      song_count: count(schema.songs.id),
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.state, 0), isNotNull(schema.songs.artistSlug)))
    .groupBy(schema.songs.artistSlug)
    .orderBy(asc(schema.songs.artist))

  const groups: Record<string, Array<{ name: string; slug: string; song_count: number }>> = {}
  for (const r of rows) {
    if (!r.slug) continue
    const initial = initialLetterOf(r.name)
    if (!groups[initial]) groups[initial] = []
    groups[initial].push({ name: r.name, slug: r.slug, song_count: r.song_count })
  }
  return groups
}

function initialLetterOf(text: string): string {
  const ch = text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().charAt(0).toUpperCase()
  if (ch >= "A" && ch <= "Z") return ch
  return "#"
}

/**
 * Llista mínima per al sitemap: totes les parelles (artist_slug, song_slug)
 * públiques amb la seva data de darrera modificació.
 */
export async function listPublicSongsForSitemap() {
  const rows = await db
    .select({
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      updatedAt: schema.songs.updatedAt,
    })
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.state, 0),
        isNotNull(schema.songs.artistSlug),
        isNotNull(schema.songs.songSlug),
      ),
    )

  return rows
    .filter(
      (r): r is { artistSlug: string; songSlug: string; updatedAt: string | null } =>
        r.artistSlug !== null && r.songSlug !== null,
    )
    .map((r) => ({
      artistSlug: r.artistSlug,
      songSlug: r.songSlug,
      updatedAt: r.updatedAt,
    }))
}

/**
 * Llista mínima d'artistes únics per al sitemap.
 * Retorna l'`updatedAt` més recent del grup d'artist (proxy de "darrera
 * actualització" de la pàgina d'artista).
 */
export async function listPublicArtistsForSitemap() {
  const rows = await db
    .select({
      artistSlug: schema.songs.artistSlug,
      lastUpdated: sql<string | null>`MAX(${schema.songs.updatedAt})`,
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.state, 0), isNotNull(schema.songs.artistSlug)))
    .groupBy(schema.songs.artistSlug)

  return rows
    .filter((r): r is { artistSlug: string; lastUpdated: string | null } => r.artistSlug !== null)
    .map((r) => ({ artistSlug: r.artistSlug, updatedAt: r.lastUpdated }))
}

/** Cançó per la parella (artist_slug, song_slug). Només cançons públiques. */
export async function getSongBySlug(artistSlug: string, songSlug: string) {
  const [song] = await db
    .select()
    .from(schema.songs)
    .where(
      and(
        eq(schema.songs.artistSlug, artistSlug),
        eq(schema.songs.songSlug, songSlug),
        eq(schema.songs.state, 0),
      ),
    )
    .limit(1)

  if (!song) return null
  return mapSong(song)
}

/**
 * Totes les cançons públiques d'un artista (per `artist_slug`).
 * Retorna `null` si l'artista no té cançons públiques.
 */
export async function getArtistBySlug(slug: string) {
  const rows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      year: schema.songs.year,
      album: schema.songs.album,
    })
    .from(schema.songs)
    .where(and(eq(schema.songs.artistSlug, slug), eq(schema.songs.state, 0)))
    .orderBy(asc(schema.songs.title))

  if (rows.length === 0) return null

  const name = rows[0].artist
  return {
    name,
    slug,
    songs: rows
      .filter((r): r is typeof r & { songSlug: string } => r.songSlug !== null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        song_slug: r.songSlug,
        key: r.key,
        year: r.year,
        album: r.album,
      })),
  }
}
