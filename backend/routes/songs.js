const express = require("express")
const router = express.Router()
const db = require("../db")

// GET /api/songs — llista totes les cançons (sense el contingut complet)
router.get("/", (req, res) => {
  const { search, artist, sortBy = "title", order = "ASC" } = req.query

  const validSort = ["title", "artist", "key", "created_at"].includes(sortBy) ? sortBy : "title"
  const validOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC"

  let query = "SELECT id, title, artist, key, capo, language, tags FROM songs WHERE draft = 0"
  const params = []

  if (search) {
    query += " AND (title LIKE ? OR artist LIKE ?)"
    params.push(`%${search}%`, `%${search}%`)
  }
  if (artist) {
    query += " AND artist = ?"
    params.push(artist)
  }

  query += ` ORDER BY ${validSort} ${validOrder}`

  const songs = db.prepare(query).all(...params)
  res.json(songs)
})

// GET /api/songs/:id — detall complet d'una cançó
router.get("/:id", (req, res) => {
  const song = db.prepare("SELECT * FROM songs WHERE id = ?").get(req.params.id)
  if (!song) return res.status(404).json({ error: "Cançó no trobada" })
  res.json(song)
})

// POST /api/songs — afegir una cançó nova
router.post("/", (req, res) => {
  const { title, artist, key, capo = 0, content, language = "ca", tags = "" } = req.body
  if (!title || !artist || !key || !content) {
    return res.status(400).json({ error: "Falten camps obligatoris: title, artist, key, content" })
  }
  const result = db
    .prepare(
      "INSERT INTO songs (title, artist, key, capo, content, language, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(title, artist, key, capo, content, language, tags)
  res.status(201).json({ id: result.lastInsertRowid })
})

// PUT /api/songs/:id — actualitzar una cançó
router.put("/:id", (req, res) => {
  const { title, artist, key, capo, content, language, tags } = req.body
  const song = db.prepare("SELECT id FROM songs WHERE id = ?").get(req.params.id)
  if (!song) return res.status(404).json({ error: "Cançó no trobada" })

  db.prepare(
    `
    UPDATE songs SET title=?, artist=?, key=?, capo=?, content=?, language=?, tags=?
    WHERE id=?
  `,
  ).run(title, artist, key, capo ?? 0, content, language ?? "ca", tags ?? "", req.params.id)

  res.json({ ok: true })
})

// DELETE /api/songs/:id — eliminar una cançó
router.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM songs WHERE id = ?").run(req.params.id)
  if (result.changes === 0) return res.status(404).json({ error: "Cançó no trobada" })
  res.json({ ok: true })
})

module.exports = router
