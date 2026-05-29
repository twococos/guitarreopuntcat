/**
 * Script de backfill: genera `artist_slug` i `song_slug` per a totes les
 * cançons de la BD que encara no en tinguin.
 *
 * Idempotent: es pot tornar a executar sense efectes col·laterals.
 *
 * Algoritme:
 *   1. SELECT totes les cançons amb slugs NULL, ordenades per `id` (estable).
 *   2. Agrupa per `artist` normalitzat (NFD + diacrítics fora + lowercase + trim).
 *      Totes les cançons del mateix grup han de rebre el mateix `artist_slug`.
 *   3. Per cada grup d'artistes nou (que encara no té slug a la BD), calcula
 *      `artist_slug` base via `slugify(artist)` i resol col·lisions globals
 *      contra els slugs d'artista ja existents (log dels casos sospitosos).
 *   4. Per cada cançó dins el grup, calcula `song_slug` base i resol
 *      col·lisions dins l'artista.
 *   5. UPDATE en transacció única.
 *
 * Execució:
 *   npx tsx scripts/backfill-song-slugs.ts
 *
 * Es recomana fer còpia abans:
 *   cp data/canconer.db data/canconer.db.bak
 */
import Database from "better-sqlite3"
import path from "node:path"
import { slugify, resolveCollision } from "../src/lib/slugify"

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "canconer.db")

interface SongRow {
  id: number
  title: string
  artist: string
  artist_slug: string | null
  song_slug: string | null
}

function normalizeArtistKey(artist: string): string {
  return artist
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

function main() {
  console.log(`[backfill-song-slugs] BD: ${DB_PATH}`)
  const db = new Database(DB_PATH)
  db.pragma("foreign_keys = ON")

  const allSongs = db
    .prepare<unknown[], SongRow>(
      `SELECT id, title, artist, artist_slug, song_slug FROM songs ORDER BY id ASC`,
    )
    .all() as SongRow[]

  console.log(`[backfill-song-slugs] ${allSongs.length} cançons totals`)

  // Slugs ja en ús (de cançons que ja en tenen). Els necessitem per resoldre
  // col·lisions entre artistes diferents.
  const artistSlugByKey = new Map<string, string>() // normalizeArtistKey(artist) → artist_slug
  const usedArtistSlugs = new Set<string>()
  const usedSongSlugsByArtist = new Map<string, Set<string>>() // artist_slug → Set<song_slug>

  for (const s of allSongs) {
    if (s.artist_slug) {
      usedArtistSlugs.add(s.artist_slug)
      const key = normalizeArtistKey(s.artist)
      artistSlugByKey.set(key, s.artist_slug)
      if (s.song_slug) {
        let group = usedSongSlugsByArtist.get(s.artist_slug)
        if (!group) {
          group = new Set()
          usedSongSlugsByArtist.set(s.artist_slug, group)
        }
        group.add(s.song_slug)
      }
    }
  }

  const pending = allSongs.filter((s) => !s.artist_slug || !s.song_slug)
  console.log(`[backfill-song-slugs] ${pending.length} cançons per processar`)

  if (pending.length === 0) {
    console.log("[backfill-song-slugs] Res a fer. Sortint.")
    db.close()
    return
  }

  type Update = { id: number; artist_slug: string; song_slug: string }
  const updates: Update[] = []
  const collisionLog: Array<{ id: number; artist: string; baseSlug: string; usedSlug: string }> = []

  for (const song of pending) {
    const artistKey = normalizeArtistKey(song.artist)
    let artistSlug = artistSlugByKey.get(artistKey)

    if (!artistSlug) {
      const baseArtistSlug = slugify(song.artist)
      artistSlug = resolveCollision(baseArtistSlug, usedArtistSlugs)
      if (artistSlug !== baseArtistSlug) {
        collisionLog.push({
          id: song.id,
          artist: song.artist,
          baseSlug: baseArtistSlug,
          usedSlug: artistSlug,
        })
      }
      usedArtistSlugs.add(artistSlug)
      artistSlugByKey.set(artistKey, artistSlug)
    }

    let songGroup = usedSongSlugsByArtist.get(artistSlug)
    if (!songGroup) {
      songGroup = new Set()
      usedSongSlugsByArtist.set(artistSlug, songGroup)
    }

    const baseSongSlug = slugify(song.title)
    const songSlug = resolveCollision(baseSongSlug, songGroup)
    songGroup.add(songSlug)

    updates.push({ id: song.id, artist_slug: artistSlug, song_slug: songSlug })
  }

  const updateStmt = db.prepare(
    `UPDATE songs SET artist_slug = ?, song_slug = ? WHERE id = ?`,
  )
  const tx = db.transaction((rows: Update[]) => {
    for (const r of rows) {
      updateStmt.run(r.artist_slug, r.song_slug, r.id)
    }
  })
  tx(updates)

  console.log(`[backfill-song-slugs] OK — ${updates.length} cançons actualitzades`)

  if (collisionLog.length > 0) {
    console.log(`\n[backfill-song-slugs] ⚠ ${collisionLog.length} col·lisions d'artist_slug:`)
    for (const c of collisionLog) {
      console.log(
        `  - id=${c.id} "${c.artist}" → "${c.baseSlug}" ja existia, assignat "${c.usedSlug}"`,
      )
    }
    console.log(
      "Reviseu manualment aquests casos: poden ser artistes diferents amb noms similars o errors d'entrada.",
    )
  }

  db.close()
}

main()
