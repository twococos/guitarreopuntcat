import { eq, and, sql } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"
import { db, schema } from "@/db/client"
import { mapCanconer, mapSong } from "./utils"
import type { CanconerSave } from "@/lib/schemas/canconer"

// ─── GET /api/canconers ──────────────────────────────────────

export async function listCanconersByUser(userId: number) {
  const rows = await db
    .select({
      id: schema.canconers.id,
      userId: schema.canconers.userId,
      title: schema.canconers.title,
      shareToken: schema.canconers.shareToken,
      style: schema.canconers.style,
      accentColor: schema.canconers.accentColor,
      pdfOptions: schema.canconers.pdfOptions,
      createdAt: schema.canconers.createdAt,
      updatedAt: schema.canconers.updatedAt,
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

// ─── GET /api/canconers/[id] ─────────────────────────────────

export async function getCanconerById(id: number, userId: number) {
  const [canconer] = await db
    .select()
    .from(schema.canconers)
    .where(and(eq(schema.canconers.id, id), eq(schema.canconers.userId, userId)))
    .limit(1)

  if (!canconer) return null

  const songRows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      key: schema.songs.key,
      capo: schema.songs.capo,
      content: schema.songs.content,
      language: schema.songs.language,
      tags: schema.songs.tags,
      draft: schema.songs.draft,
      createdAt: schema.songs.createdAt,
      semitones: schema.canconerSongs.semitones,
      position: schema.canconerSongs.position,
    })
    .from(schema.canconerSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(eq(schema.canconerSongs.canconerId, id))
    .orderBy(schema.canconerSongs.position)

  return {
    ...mapCanconer(canconer),
    songs: songRows.map((s) => ({
      ...mapSong(s),
      semitones: s.semitones ?? 0,
      position: s.position,
    })),
  }
}

// ─── GET /api/canconers/shared/[token] ───────────────────────

export async function getCanconerByToken(token: string) {
  const [canconer] = await db
    .select({
      id: schema.canconers.id,
      userId: schema.canconers.userId,
      title: schema.canconers.title,
      shareToken: schema.canconers.shareToken,
      style: schema.canconers.style,
      accentColor: schema.canconers.accentColor,
      pdfOptions: schema.canconers.pdfOptions,
      createdAt: schema.canconers.createdAt,
      updatedAt: schema.canconers.updatedAt,
      ownerName: schema.users.name,
    })
    .from(schema.canconers)
    .innerJoin(schema.users, eq(schema.users.id, schema.canconers.userId))
    .where(eq(schema.canconers.shareToken, token))
    .limit(1)

  if (!canconer) return null

  const songRows = await db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      artist: schema.songs.artist,
      key: schema.songs.key,
      capo: schema.songs.capo,
      content: schema.songs.content,
      language: schema.songs.language,
      tags: schema.songs.tags,
      draft: schema.songs.draft,
      createdAt: schema.songs.createdAt,
      semitones: schema.canconerSongs.semitones,
      position: schema.canconerSongs.position,
    })
    .from(schema.canconerSongs)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.canconerSongs.songId))
    .where(eq(schema.canconerSongs.canconerId, canconer.id))
    .orderBy(schema.canconerSongs.position)

  return {
    ...mapCanconer(canconer),
    owner_name: canconer.ownerName,
    songs: songRows.map((s) => ({
      ...mapSong(s),
      semitones: s.semitones ?? 0,
      position: s.position,
    })),
  }
}

// ─── POST /api/canconers ─────────────────────────────────────

export async function saveOrUpdateCanconer(userId: number, data: CanconerSave) {
  const { id, title, style, accent_color, pdf_options, songs } = data

  // Validate all songs exist and are public (draft=0)
  for (const s of songs) {
    const [song] = await db
      .select({ id: schema.songs.id, draft: schema.songs.draft })
      .from(schema.songs)
      .where(eq(schema.songs.id, s.id))
      .limit(1)

    if (!song || (song.draft ?? 0) !== 0) {
      throw new Error("Alguna cançó no existeix o no és pública")
    }
  }

  if (id !== undefined) {
    // Update existing cançoner
    const [existing] = await db
      .select({ userId: schema.canconers.userId })
      .from(schema.canconers)
      .where(eq(schema.canconers.id, id))
      .limit(1)

    if (!existing || existing.userId !== userId) {
      const err = new Error("No autoritzat")
      ;(err as Error & { status: number }).status = 403
      throw err
    }

    db.transaction((tx) => {
      tx
        .update(schema.canconers)
        .set({
          title,
          style,
          accentColor: accent_color,
          pdfOptions: pdf_options,
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
