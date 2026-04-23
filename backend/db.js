const Database = require("better-sqlite3")
const path = require("path")

const db = new Database(path.join(__dirname, "canconer.db"))

// Activar foreign keys i WAL per millor rendiment
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  /* ── Cançons ─────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS songs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    artist     TEXT NOT NULL,
    key        TEXT NOT NULL,
    capo       INTEGER DEFAULT 0,
    content    TEXT NOT NULL,
    language   TEXT DEFAULT 'ca',
    tags       TEXT DEFAULT '',
    draft      INTEGER DEFAULT 0,   -- 1 = pendent d'aprovació
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ── Usuaris ─────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id      TEXT UNIQUE NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    avatar_url     TEXT,
    role           TEXT DEFAULT 'user',  -- 'user' | 'admin'
    active         INTEGER DEFAULT 1,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  /* ── Cançoners ───────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS canconers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL DEFAULT 'El meu cançoner',
    share_token  TEXT UNIQUE,           -- NULL = no compartit
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  /* ── Cançons d'un cançoner ───────────────────────────────── */
  CREATE TABLE IF NOT EXISTS canconer_songs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    canconer_id INTEGER NOT NULL REFERENCES canconers(id) ON DELETE CASCADE,
    song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    semitones   INTEGER DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0
  );

  /* ── Propostes de cançons ────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS song_proposals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    status      TEXT DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'
    reviewer_id INTEGER REFERENCES users(id),
    notes       TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT
  );
`)

module.exports = db
