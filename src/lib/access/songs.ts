import "server-only"
import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { SONG_STATE } from "@/lib/songKind"
import { PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS } from "./policy"

/**
 * Regla única de visibilitat de les cançons. Cap ruta la reimplementa.
 *
 * Una cançó es pot veure si:
 *   1. és pública, o
 *   2. n'ets el propietari, o
 *   3. ets admin, o
 *   4. és dins d'un cançoner teu (si l'admin passa a privada una pública que
 *      ja tenies, no se't trenca el cançoner), o
 *   5. la demanes dins d'un cançoner públic, o amb el seu share_token, i en
 *      forma part (vegeu PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS).
 *
 * Per no revelar que existeix, qui no la pot veure rep un 404.
 */

export type Viewer = { id: number; role: "user" | "admin" } | null

export type SongbookContext = { songbookId: number } | { shareToken: string }

export interface SongAccessRow {
  id: number
  state: number
  ownerId: number | null
}

/**
 * Condició per a llistes i cerques de l'usuari: públiques + pròpies. També per
 * als admins: les privades dels altres només surten al panell d'admin.
 */
export function songListCondition(viewer: Viewer): SQL {
  const isPublic = eq(schema.songs.state, SONG_STATE.PUBLIC)
  if (!viewer) return isPublic
  return or(isPublic, eq(schema.songs.ownerId, viewer.id))!
}

function directlyVisible(song: SongAccessRow, viewer: Viewer): boolean {
  if (song.state === SONG_STATE.PUBLIC) return true
  if (!viewer) return false
  return viewer.role === "admin" || song.ownerId === viewer.id
}

/** Ids (d'entre `ids`) que són dins d'algun cançoner de l'usuari. */
function idsInOwnSongbooks(ids: number[], userId: number): Set<number> {
  if (ids.length === 0) return new Set()
  const rows = db
    .selectDistinct({ songId: schema.canconerSongs.songId })
    .from(schema.canconerSongs)
    .innerJoin(schema.canconers, eq(schema.canconers.id, schema.canconerSongs.canconerId))
    .where(and(eq(schema.canconers.userId, userId), inArray(schema.canconerSongs.songId, ids)))
    .all()
  return new Set(rows.map((r) => r.songId))
}

/** Ids (d'entre `ids`) que el context de cançoner fa visibles. */
function idsAllowedByContext(ids: number[], ctx: SongbookContext): Set<number> {
  if (ids.length === 0) return new Set()
  const where =
    "shareToken" in ctx
      ? eq(schema.canconers.shareToken, ctx.shareToken)
      : PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS
        ? and(eq(schema.canconers.id, ctx.songbookId), eq(schema.canconers.visibility, 1))
        : undefined
  if (!where) return new Set()
  const rows = db
    .selectDistinct({ songId: schema.canconerSongs.songId })
    .from(schema.canconerSongs)
    .innerJoin(schema.canconers, eq(schema.canconers.id, schema.canconerSongs.canconerId))
    .where(and(where, inArray(schema.canconerSongs.songId, ids)))
    .all()
  return new Set(rows.map((r) => r.songId))
}

/** Filtra una llista de cançons i deixa només les que `viewer` pot veure. */
export function filterViewableSongs<T extends SongAccessRow>(
  songs: T[],
  viewer: Viewer,
  ctx?: SongbookContext,
): T[] {
  const pending = songs.filter((s) => !directlyVisible(s, viewer)).map((s) => s.id)
  if (pending.length === 0) return songs
  const allowed = new Set<number>()
  if (viewer) for (const id of idsInOwnSongbooks(pending, viewer.id)) allowed.add(id)
  if (ctx) for (const id of idsAllowedByContext(pending, ctx)) allowed.add(id)
  return songs.filter((s) => directlyVisible(s, viewer) || allowed.has(s.id))
}

export function canViewSong(song: SongAccessRow, viewer: Viewer, ctx?: SongbookContext): boolean {
  return filterViewableSongs([song], viewer, ctx).length === 1
}

/**
 * Editar el contingut directament (PUT /api/songs/[id]): l'admin qualsevol,
 * el propietari només les privades. Les propostes pendents s'editen pel
 * flux de proposta (PUT /api/proposals/[id]).
 */
export function canEditSong(song: SongAccessRow, viewer: Viewer): boolean {
  if (!viewer) return false
  if (viewer.role === "admin") return true
  return song.state === SONG_STATE.PRIVATE && song.ownerId === viewer.id
}

export const canDeleteSong = canEditSong

/** Lectura mínima per a les comprovacions d'accés. */
export function getSongAccessRow(id: number): SongAccessRow | null {
  const row = db
    .select({ id: schema.songs.id, state: schema.songs.state, ownerId: schema.songs.ownerId })
    .from(schema.songs)
    .where(eq(schema.songs.id, id))
    .get()
  return row ?? null
}
