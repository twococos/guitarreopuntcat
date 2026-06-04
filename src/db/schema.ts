import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { PdfOptions } from "@/lib/schemas/canconer"

// ─── Cançons ────────────────────────────────────────────────
export const songs = sqliteTable(
  "songs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    // Slugs URL-safe per a les rutes públiques /songs/[artist]/[song].
    // Generats al moment de creació i mai re-generats automàticament
    // encara que canviï `title` o `artist` (evitem trencar enllaços externs).
    // `artistSlug` és únic globalment per artista (totes les cançons del
    // mateix artista comparteixen el mateix slug).
    artistSlug: text("artist_slug"),
    songSlug: text("song_slug"),
    key: text("key").notNull(),
    capo: integer("capo").default(0),
    content: text("content").notNull(),
    language: text("language").default("ca"),
    tags: text("tags").default(""),
    album: text("album"),
    year: integer("year"),
    youtubeUrl: text("youtube_url"),
    spotifyUrl: text("spotify_url"),
    state: integer("state").notNull().default(0),
    // 0 pública, 1 privada, 2 pendent, 3 rebutjada, 4 cancel·lada
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    slugUnique: uniqueIndex("songs_artist_song_slug_unique").on(t.artistSlug, t.songSlug),
  }),
)

// ─── Usuaris ────────────────────────────────────────────────
// Nota: el camp `googleId` es manté per compatibilitat amb dades
// existents. NextAuth identifica via la taula `accounts`.
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    googleId: text("google_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    googleName: text("google_name"),
    avatarUrl: text("avatar_url"),
    role: text("role", { enum: ["user", "admin"] }).default("user"),
    active: integer("active").default(1),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    googleIdUnique: uniqueIndex("users_google_id_unique").on(t.googleId),
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
  }),
)

// ─── Cançoners ──────────────────────────────────────────────
export const canconers = sqliteTable(
  "canconers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("El meu cançoner"),
    shareToken: text("share_token"),
    style: text("style").notNull().default("classic"),
    accentColor: text("accent_color"),
    pdfOptions: text("pdf_options", { mode: "json" }).$type<PdfOptions>(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (t) => ({
    shareTokenUnique: uniqueIndex("canconers_share_token_unique").on(t.shareToken),
  }),
)

// ─── Cançons d'un cançoner ──────────────────────────────────
export const canconerSongs = sqliteTable("canconer_songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  canconerId: integer("canconer_id")
    .notNull()
    .references(() => canconers.id, { onDelete: "cascade" }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  semitones: integer("semitones").default(0),
  position: integer("position").notNull().default(0),
})

// ─── Propostes de cançons ───────────────────────────────────
export const songProposals = sqliteTable("song_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "cancelled"],
  }).default("pending"),
  reviewerId: integer("reviewer_id").references(() => users.id),
  notes: text("notes").default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  reviewedAt: text("reviewed_at"),
  resubmittedAt: text("resubmitted_at"),
})

// ─── Tipus inferits ─────────────────────────────────────────
export type Song = typeof songs.$inferSelect
export type SongInsert = typeof songs.$inferInsert
export type User = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
export type Canconer = typeof canconers.$inferSelect
export type CanconerInsert = typeof canconers.$inferInsert
export type CanconerSong = typeof canconerSongs.$inferSelect
export type CanconerSongInsert = typeof canconerSongs.$inferInsert
export type SongProposal = typeof songProposals.$inferSelect
export type SongProposalInsert = typeof songProposals.$inferInsert
