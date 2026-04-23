const express = require("express")
const { v4: uuidv4 } = require("uuid")
const db = require("../db")
const { requireAuth } = require("../middleware/auth")

const router = express.Router()

/* ── GET /api/canconers — llista els meus cançoners ────────── */
router.get("/", requireAuth, (req, res) => {
  const canconers = db
    .prepare(
      `
    SELECT c.*, COUNT(cs.id) as song_count
    FROM canconers c
    LEFT JOIN canconer_songs cs ON cs.canconer_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `,
    )
    .all(req.user.id)
  res.json(canconers)
})

/* ── GET /api/canconers/:id — detall d'un cançoner ─────────── */
router.get("/:id", requireAuth, (req, res) => {
  const canconer = db
    .prepare("SELECT * FROM canconers WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id)
  if (!canconer) return res.status(404).json({ error: "No trobat" })

  const songs = db
    .prepare(
      `
    SELECT cs.semitones, cs.position, s.*
    FROM canconer_songs cs
    JOIN songs s ON s.id = cs.song_id
    WHERE cs.canconer_id = ?
    ORDER BY cs.position
  `,
    )
    .all(canconer.id)

  res.json({ ...canconer, songs })
})

/* ── GET /api/canconers/shared/:token — cançoner públic ────── */
router.get("/shared/:token", (req, res) => {
  const canconer = db.prepare("SELECT * FROM canconers WHERE share_token = ?").get(req.params.token)
  if (!canconer) return res.status(404).json({ error: "Enllaç no vàlid" })

  const songs = db
    .prepare(
      `
    SELECT cs.semitones, cs.position, s.*
    FROM canconer_songs cs
    JOIN songs s ON s.id = cs.song_id
    WHERE cs.canconer_id = ?
    ORDER BY cs.position
  `,
    )
    .all(canconer.id)

  const owner = db.prepare("SELECT name FROM users WHERE id = ?").get(canconer.user_id)
  res.json({ ...canconer, songs, owner_name: owner?.name })
})

/* ── POST /api/canconers — crear o sobreescriure un cançoner── */
router.post("/", requireAuth, (req, res) => {
  const { title = "El meu cançoner", songs = [], id: existingId } = req.body

  // Validar que les cançons existeixin i no siguin esborranys
  const placeholders = songs.map(() => "?").join(",")
  if (songs.length) {
    const ids = songs.map((s) => s.id)
    const found = db
      .prepare(`SELECT id FROM songs WHERE id IN (${placeholders}) AND draft = 0`)
      .all(...ids)
    if (found.length !== songs.length)
      return res.status(400).json({ error: "Alguna cançó no existeix o no és pública" })
  }

  const save = db.transaction(() => {
    let canconerId = existingId

    if (existingId) {
      // Verificar que és del mateix usuari
      const existing = db
        .prepare("SELECT id FROM canconers WHERE id = ? AND user_id = ?")
        .get(existingId, req.user.id)
      if (!existing) throw new Error("No autoritzat")
      db.prepare('UPDATE canconers SET title=?, updated_at=datetime("now") WHERE id=?').run(
        title,
        existingId,
      )
    } else {
      const result = db
        .prepare("INSERT INTO canconers (user_id, title) VALUES (?, ?)")
        .run(req.user.id, title)
      canconerId = result.lastInsertRowid
    }

    // Substituir les cançons
    db.prepare("DELETE FROM canconer_songs WHERE canconer_id = ?").run(canconerId)
    const insertSong = db.prepare(
      "INSERT INTO canconer_songs (canconer_id, song_id, semitones, position) VALUES (?, ?, ?, ?)",
    )
    songs.forEach((s, i) => insertSong.run(canconerId, s.id, s.semitones ?? 0, i))

    return canconerId
  })

  try {
    const id = save()
    res.status(existingId ? 200 : 201).json({ id })
  } catch (err) {
    res.status(403).json({ error: err.message })
  }
})

/* ── DELETE /api/canconers/:id — eliminar ───────────────────── */
router.delete("/:id", requireAuth, (req, res) => {
  const result = db
    .prepare("DELETE FROM canconers WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ error: "No trobat" })
  res.json({ ok: true })
})

/* ── POST /api/canconers/:id/share — generar/revocar token ─── */
router.post("/:id/share", requireAuth, (req, res) => {
  const canconer = db
    .prepare("SELECT * FROM canconers WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id)
  if (!canconer) return res.status(404).json({ error: "No trobat" })

  const { action = "enable" } = req.body
  if (action === "disable") {
    db.prepare("UPDATE canconers SET share_token = NULL WHERE id = ?").run(canconer.id)
    return res.json({ share_token: null })
  }

  const token = canconer.share_token || uuidv4()
  db.prepare("UPDATE canconers SET share_token = ? WHERE id = ?").run(token, canconer.id)
  res.json({ share_token: token })
})

module.exports = router
