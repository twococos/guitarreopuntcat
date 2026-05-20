import { eq, like, or, asc, desc, and } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { mapSong, mapSongSummary } from "./utils"
import type { SongQuery } from "@/lib/schemas/song"

// ─── GET /api/songs ──────────────────────────────────────────

export async function listSongs(query: SongQuery) {
  const { search, artist, sortBy, order } = query

  const conditions = [eq(schema.songs.draft, 0)]

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
      key: schema.songs.key,
      capo: schema.songs.capo,
      language: schema.songs.language,
      tags: schema.songs.tags,
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

// ─── POST /api/songs ─────────────────────────────────────────

export async function createSong(data: {
  title: string
  artist: string
  key: string
  capo: number
  content: string
  language: string
  tags: string
}) {
  const result = db
    .insert(schema.songs)
    .values({
      title: data.title,
      artist: data.artist,
      key: data.key,
      capo: data.capo,
      content: data.content,
      language: data.language,
      tags: data.tags,
      draft: 0,
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
    draft: number
  }>,
) {
  const result = db
    .update(schema.songs)
    .set(data)
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
