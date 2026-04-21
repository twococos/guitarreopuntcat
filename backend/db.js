const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'canconer.db'));

// Activar foreign keys i WAL per millor rendiment
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Crear taules si no existeixen
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT NOT NULL,
    artist    TEXT NOT NULL,
    key       TEXT NOT NULL,      -- To original, ex: "G", "Am", "F#"
    capo      INTEGER DEFAULT 0,  -- Cejilla si s'escau
    content   TEXT NOT NULL,      -- HTML amb acords marcats
    language  TEXT DEFAULT 'ca',  -- Idioma de la cançó
    tags      TEXT DEFAULT '',    -- Etiquetes separades per comes
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
