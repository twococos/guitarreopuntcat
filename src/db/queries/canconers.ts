import { eq, and, or, sql, like, inArray, desc, type SQL } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"
import { db, schema } from "@/db/client"
import { mapCanconer, mapSong } from "./utils"
import type { CanconerSave } from "@/lib/schemas/canconer"
import { filterViewableSongs, type Viewer } from "@/lib/access/songs"
import { slugify } from "@/lib/slugify"
import { SONG_STATE } from "@/lib/songKind"
import { PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS } from "@/lib/access/policy"
import { getSongbookViewCounts } from "./analytics/songbookViews"

const NOW_SQL = sql`(datetime('now'))`

const canconerCols = {
  id: schema.canconers.id,
  userId: schema.canconers.userId,
  title: schema.canconers.title,
  shareToken: schema.canconers.shareToken,
  style: schema.canconers.style,
  accentColor: schema.canconers.accentColor,
  pdfOptions: schema.canconers.pdfOptions,
  visibility: schema.canconers.visibility,
  slug: schema.canconers.slug,
  publishedAt: schema.canconers.publishedAt,
  createdAt: schema.canconers.createdAt,
  updatedAt: schema.canconers.updatedAt,
}

// ─── GET /api/canconers ──────────────────────────────────────

export async function listCanconersByUser(userId: number) {
  const rows = await db
    .select({
      ...canconerCols,
      song_count: sql<number>`COUNT(${schema.canconerSongs.id})`.as("song_count"),
    })
    .from(schema.canconers)
    .leftJoin(
      schema.canconerSongs,
      eq(schema.canconerSongs.canconerId, schema.canconers.id),
    )
    .where(eq(schema.canconers.userId, userId))
    .groupBy(schema.canconers.id)
    .orderBy(sql`${schema.canconers.updatedAt} DESC`)

  return rows.map((r) => ({
    ...mapCanconer(r),
    song_count: r.song_count,
  }))
}

// ─── Cançons d'un cançoner ───────────────────────────────────

/** Totes les cançons d'un cançoner, en ordre, amb el contingut. Sense filtre d'accés. */
function loadCanconerSongs(canconerId: number) {
  const rows = db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      artistSlug: schema.songs.artistSlug,
      songSlug: schema.songs.songSlug,
      key: schema.songs.key,
      capo: schema.songs.capo,
      content: schema.songs.content,
      language: schema.songs.language,
      tags: schema.songs.tags,
      album: schema.songs.album,
      year: schema.songs.year,
      youtubeUrl: schema.songs.youtubeUrl,
      spotifyUrl: schema.songs.spotifyUrl,
      state: schema.songs.state,
      ownerId: schema.songs.ownerId,
      originalSongId: schema.songs.originalSongId,
      createdAt: schema.songs.createdAt,
      updatedAt: schema.songs.updatedAt,
      semitones: schema.canconerSongs.semitones,
      position: schema.canconerSongs.position,
    })
    .from(schema.canconerSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(eq(schema.canconerSongs.canconerId, canconerId))
    .orderBy(schema.canconerSongs.position)
    .all()
  return rows
}

type CanconerSongRow = ReturnType<typeof loadCanconerSongs>[number]

function mapCanconerSongs(rows: CanconerSongRow[]) {
  return rows.map((s) => ({
    ...mapSong(s),
    semitones: s.semitones ?? 0,
    position: s.position,
  }))
}

function loadCanconerHeader(where: SQL) {
  return db
    .select({ ...canconerCols, ownerName: schema.users.name })
    .from(schema.canconers)
    .innerJoin(schema.users, eq(schema.users.id, schema.canconers.userId))
    .where(where)
    .get()
}

// ─── GET /api/canconers/[id] ─────────────────────────────────

/** Retorna el cançoner amb les seves cançons i el nom del propietari.
 *  Si `userId` és definit, afegeix un filtre d'ownership (el cançoner
 *  ha de pertànyer a l'usuari). Si és undefined, no es comprova (ús admin).
 */
async function getCanconerByIdInternal(id: number, userId?: number) {
  const whereClause = userId !== undefined
    ? and(eq(schema.canconers.id, id), eq(schema.canconers.userId, userId))!
    : eq(schema.canconers.id, id)

  const canconer = loadCanconerHeader(whereClause)
  if (!canconer) return null

  return {
    ...mapCanconer(canconer),
    owner_name: canconer.ownerName,
    songs: mapCanconerSongs(loadCanconerSongs(id)),
  }
}

/** Retorna el cançoner del propietari especificat (amb ownership check).
 *  Retorna null si no existeix o si no pertany a l'usuari.
 */
export async function getCanconerById(id: number, userId: number) {
  return getCanconerByIdInternal(id, userId)
}

/** Retorna qualsevol cançoner per id, sense restricció d'usuari.
 *  Ús exclusiu per a administradors.
 */
export async function getCanconerByIdForAdmin(id: number) {
  return getCanconerByIdInternal(id, undefined)
}

// ─── GET /api/canconers/shared/[token] ───────────────────────

/** El token el dona el propietari: hi surten totes les cançons. */
export async function getCanconerByToken(token: string) {
  const canconer = loadCanconerHeader(eq(schema.canconers.shareToken, token))
  if (!canconer) return null

  return {
    ...mapCanconer(canconer),
    owner_name: canconer.ownerName,
    songs: mapCanconerSongs(loadCanconerSongs(canconer.id)),
  }
}

// ─── /songbooks/[id]/[slug] ──────────────────────────────────

/**
 * Cançoner públic, o null si no ho és. Les cançons passen per la regla
 * d'accés amb el context del cançoner (PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS).
 */
export async function getPublicSongbook(id: number, viewer: Viewer) {
  const canconer = loadCanconerHeader(
    and(eq(schema.canconers.id, id), eq(schema.canconers.visibility, 1))!,
  )
  if (!canconer) return null

  const songs = filterViewableSongs(loadCanconerSongs(id), viewer, { songbookId: id })
  return {
    ...mapCanconer(canconer),
    owner_name: canconer.ownerName,
    songs: mapCanconerSongs(songs),
  }
}

// ─── POST /api/canconers ─────────────────────────────────────

export async function saveOrUpdateCanconer(user: NonNullable<Viewer>, data: CanconerSave) {
  const { id, title, style, accent_color, pdf_options, songs } = data
  const userId = user.id

  let existing: { userId: number; visibility: number } | undefined
  if (id !== undefined) {
    existing = db
      .select({ userId: schema.canconers.userId, visibility: schema.canconers.visibility })
      .from(schema.canconers)
      .where(eq(schema.canconers.id, id))
      .get()

    if (!existing || existing.userId !== userId) {
      const err = new Error("No autoritzat")
      ;(err as Error & { status: number }).status = 403
      throw err
    }
  }

  // Es poden posar les cançons que l'usuari pot veure, i es conserven les
  // que ja hi eren (encara que després hagin deixat de ser públiques).
  const ids = [...new Set(songs.map((s) => s.id))]
  const rows = ids.length
    ? db
        .select({ id: schema.songs.id, state: schema.songs.state, ownerId: schema.songs.ownerId })
        .from(schema.songs)
        .where(inArray(schema.songs.id, ids))
        .all()
    : []
  const allowed = new Set(filterViewableSongs(rows, user).map((r) => r.id))
  if (id !== undefined) {
    for (const r of db
      .select({ songId: schema.canconerSongs.songId })
      .from(schema.canconerSongs)
      .where(eq(schema.canconerSongs.canconerId, id))
      .all()) allowed.add(r.songId)
  }
  if (ids.some((sid) => !allowed.has(sid))) {
    throw new Error("Alguna cançó no existeix o no és accessible")
  }

  if (id !== undefined) {
    db.transaction((tx) => {
      tx
        .update(schema.canconers)
        .set({
          title,
          style,
          accentColor: accent_color,
          pdfOptions: pdf_options,
          // Si és públic, el slug segueix el títol (la URL vella redirigeix)
          ...(existing!.visibility === 1 ? { slug: slugify(title) } : {}),
          updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        })
        .where(eq(schema.canconers.id, id))
        .run()

      tx.delete(schema.canconerSongs).where(eq(schema.canconerSongs.canconerId, id)).run()

      for (let i = 0; i < songs.length; i++) {
        tx
          .insert(schema.canconerSongs)
          .values({
            canconerId: id,
            songId: songs[i].id,
            semitones: songs[i].semitones ?? 0,
            position: i,
          })
          .run()
      }
    })

    return { id, created: false }
  } else {
    // Create new cançoner
    let newId: number

    db.transaction((tx) => {
      const insertResult = tx
        .insert(schema.canconers)
        .values({ userId, title, style, accentColor: accent_color, pdfOptions: pdf_options })
        .run()

      newId = Number(insertResult.lastInsertRowid)

      for (let i = 0; i < songs.length; i++) {
        tx
          .insert(schema.canconerSongs)
          .values({
            canconerId: newId,
            songId: songs[i].id,
            semitones: songs[i].semitones ?? 0,
            position: i,
          })
          .run()
      }
    })

    return { id: newId!, created: true }
  }
}

// ─── DELETE /api/canconers/[id] ──────────────────────────────

export async function deleteCanconer(id: number, userId: number) {
  const result = db
    .delete(schema.canconers)
    .where(and(eq(schema.canconers.id, id), eq(schema.canconers.userId, userId)))
    .run()

  return { changes: result.changes }
}

// ─── POST /api/canconers/[id]/share ──────────────────────────

export async function toggleShare(id: number, userId: number, action: "enable" | "disable") {
  const [canconer] = await db
    .select({ id: schema.canconers.id, shareToken: schema.canconers.shareToken })
    .from(schema.canconers)
    .where(and(eq(schema.canconers.id, id), eq(schema.canconers.userId, userId)))
    .limit(1)

  if (!canconer) return null

  if (action === "disable") {
    db.update(schema.canconers)
      .set({ shareToken: null })
      .where(eq(schema.canconers.id, id))
      .run()
    return { share_token: null }
  }

  // action === "enable"
  const token = canconer.shareToken ?? uuidv4()

  if (!canconer.shareToken) {
    db.update(schema.canconers)
      .set({ shareToken: token })
      .where(eq(schema.canconers.id, id))
      .run()
  }

  return { share_token: token }
}

// ─── POST /api/canconers/[id]/visibility ─────────────────────

/**
 * Publica o retira de la web un cançoner. El propietari, o un admin (per
 * moderar). Retorna el slug i quantes cançons no públiques conté (en
 * publicar, l'usuari n'és avisat).
 */
export function setSongbookVisibility(id: number, user: NonNullable<Viewer>, visibility: 0 | 1) {
  const c = db
    .select({ userId: schema.canconers.userId, title: schema.canconers.title })
    .from(schema.canconers)
    .where(eq(schema.canconers.id, id))
    .get()
  if (!c || (c.userId !== user.id && user.role !== "admin")) return null

  const slug = slugify(c.title)
  db.update(schema.canconers)
    .set(
      visibility === 1
        ? { visibility: 1, slug, publishedAt: NOW_SQL }
        : { visibility: 0 },
    )
    .where(eq(schema.canconers.id, id))
    .run()

  const [row] = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.canconerSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(and(
      eq(schema.canconerSongs.canconerId, id),
      sql`${schema.songs.state} <> ${SONG_STATE.PUBLIC}`,
    ))
    .all()

  return { visibility, slug, private_count: row?.n ?? 0 }
}

/**
 * Admin: copia un cançoner (amb el to de cada cançó) com a cançoner públic
 * propi de l'admin. Les cançons privades de l'autor s'hi mantenen: es veuen
 * dins del cançoner públic segons PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS.
 */
export function copySongbookAsPublic(id: number, adminId: number) {
  const src = db
    .select({
      title: schema.canconers.title,
      style: schema.canconers.style,
      accentColor: schema.canconers.accentColor,
      pdfOptions: schema.canconers.pdfOptions,
    })
    .from(schema.canconers)
    .where(eq(schema.canconers.id, id))
    .get()
  if (!src) return null

  const slug = slugify(src.title)
  let newId!: number
  db.transaction((tx) => {
    newId = Number(
      tx
        .insert(schema.canconers)
        .values({ ...src, userId: adminId, visibility: 1, slug, publishedAt: NOW_SQL })
        .run().lastInsertRowid,
    )
    const songs = tx
      .select({ songId: schema.canconerSongs.songId, semitones: schema.canconerSongs.semitones, position: schema.canconerSongs.position })
      .from(schema.canconerSongs)
      .where(eq(schema.canconerSongs.canconerId, id))
      .all()
    for (const s of songs) tx.insert(schema.canconerSongs).values({ ...s, canconerId: newId }).run()
  })
  return { id: newId, slug }
}

// ─── Àrea pública: cerca, portada i sitemap ──────────────────

function publicSongbookSummaries(where: SQL | undefined, opts: {
  limit: number
  random?: boolean
  excludeIds?: number[]
}) {
  const conditions = [eq(schema.canconers.visibility, 1)]
  if (where) conditions.push(where)
  const exclude = (opts.excludeIds ?? []).filter((n) => Number.isFinite(n))
  if (exclude.length > 0) {
    conditions.push(sql`${schema.canconers.id} NOT IN (${sql.join(exclude.map((n) => sql`${n}`), sql`, `)})`)
  }
  const rows = db
    .select({
      id: schema.canconers.id,
      title: schema.canconers.title,
      slug: schema.canconers.slug,
      style: schema.canconers.style,
      accentColor: schema.canconers.accentColor,
      ownerName: schema.users.name,
      songCount: sql<number>`(SELECT COUNT(*) FROM ${schema.canconerSongs} WHERE ${schema.canconerSongs.canconerId} = ${schema.canconers.id})`,
    })
    .from(schema.canconers)
    .innerJoin(schema.users, eq(schema.users.id, schema.canconers.userId))
    .where(and(...conditions))
    .orderBy(opts.random ? sql`RANDOM()` : desc(schema.canconers.publishedAt))
    .limit(opts.limit)
    .all()

  const artists = songbookArtists(rows.map((r) => r.id))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug ?? slugify(r.title),
    style: r.style,
    accent_color: r.accentColor,
    owner_name: r.ownerName,
    song_count: r.songCount,
    top_artists: artists.get(r.id)?.top ?? [],
    artist_count: artists.get(r.id)?.count ?? 0,
  }))
}

/**
 * Per a cada cançoner, els dos artistes amb més cançons (els empats es
 * desfan a l'atzar) i quants artistes diferents té en total.
 */
function songbookArtists(ids: number[]) {
  const out = new Map<number, { top: string[]; count: number }>()
  if (ids.length === 0) return out
  const rows = db
    .select({
      canconerId: schema.canconerSongs.canconerId,
      artist: schema.songs.artist,
      n: sql<number>`COUNT(*)`,
    })
    .from(schema.canconerSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(inArray(schema.canconerSongs.canconerId, ids))
    .groupBy(schema.canconerSongs.canconerId, schema.songs.artist)
    .all()

  const byCanconer = new Map<number, Array<{ artist: string; n: number; r: number }>>()
  for (const row of rows) {
    const list = byCanconer.get(row.canconerId) ?? []
    list.push({ artist: row.artist, n: row.n, r: Math.random() })
    byCanconer.set(row.canconerId, list)
  }
  for (const [id, list] of byCanconer) {
    list.sort((a, b) => b.n - a.n || a.r - b.r)
    out.set(id, { top: list.slice(0, 2).map((a) => a.artist), count: list.length })
  }
  return out
}

export type PublicSongbookSummary = ReturnType<typeof publicSongbookSummaries>[number]

/**
 * Cerca del hero: cançoners públics que contenen cançons o artistes que
 * coincideixen amb la cerca (o amb el títol del cançoner). Barreja els que
 * en tenen més coincidències amb els més visitats: la meitat dels llocs per
 * coincidències (desempat per visites) i la resta per visites.
 */
export function searchPublicSongbooks(q: string, limit: number) {
  const trimmed = q.trim()
  if (!trimmed) return []
  const like1 = `%${trimmed}%`
  const slugQ = `%${slugify(trimmed)}%`

  const songMatch = or(
    like(schema.songs.title, like1),
    like(schema.songs.artist, like1),
    like(schema.songs.artistSlug, slugQ),
    like(schema.songs.songSlug, slugQ),
  )!
  const matches = db
    .select({ id: schema.canconers.id, n: sql<number>`COUNT(DISTINCT ${schema.songs.id})` })
    .from(schema.canconers)
    .innerJoin(schema.canconerSongs, eq(schema.canconerSongs.canconerId, schema.canconers.id))
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(and(
      eq(schema.canconers.visibility, 1),
      songMatch,
      // Les privades només compten si es veuen dins dels cançoners públics
      PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS ? undefined : eq(schema.songs.state, SONG_STATE.PUBLIC),
    ))
    .groupBy(schema.canconers.id)
    .all()
  const titleMatches = db
    .select({ id: schema.canconers.id })
    .from(schema.canconers)
    .where(and(
      eq(schema.canconers.visibility, 1),
      or(like(schema.canconers.title, like1), like(schema.canconers.slug, slugQ)),
    ))
    .all()

  // Coincidir pel títol compta com una cançó més
  const score = new Map<number, number>()
  for (const m of matches) score.set(m.id, m.n)
  for (const m of titleMatches) score.set(m.id, (score.get(m.id) ?? 0) + 1)
  if (score.size === 0) return []

  const views = getSongbookViewCounts()
  const candidates = [...score.entries()].map(([id, n]) => ({ id, n, v: views.get(id) ?? 0, r: Math.random() }))
  const byMatches = [...candidates].sort((a, b) => b.n - a.n || b.v - a.v || a.r - b.r)
  const picked = byMatches.slice(0, Math.ceil(limit / 2))
  const rest = candidates
    .filter((c) => !picked.includes(c))
    .sort((a, b) => b.v - a.v || b.n - a.n || a.r - b.r)
  const ids = [...picked, ...rest].slice(0, limit).map((c) => c.id)

  const summaries = publicSongbookSummaries(inArray(schema.canconers.id, ids), { limit })
  return ids
    .map((id) => summaries.find((s) => s.id === id))
    .filter((s): s is PublicSongbookSummary => s !== undefined)
}

export function getRandomPublicSongbooks(count: number, excludeIds: number[] = []) {
  return publicSongbookSummaries(undefined, { limit: Math.max(1, count), random: true, excludeIds })
}

export function listPublicSongbooksForSitemap() {
  return db
    .select({
      id: schema.canconers.id,
      title: schema.canconers.title,
      slug: schema.canconers.slug,
      updatedAt: schema.canconers.updatedAt,
    })
    .from(schema.canconers)
    .where(eq(schema.canconers.visibility, 1))
    .all()
    .map((r) => ({ id: r.id, slug: r.slug ?? slugify(r.title), updatedAt: r.updatedAt }))
}
