const express = require("express")
const db = require("../db")
const { requireAuth, requireAdmin } = require("../middleware/auth")

const router = express.Router()

/* ── GET /api/proposals — llista (admin: totes, user: les seves) */
router.get("/", requireAuth, (req, res) => {
  const isAdmin = req.user.role === "admin"
  const rows = db
    .prepare(
      `
    SELECT p.*, s.title as song_title, s.artist as song_artist,
           u.name as proposer_name, u.avatar_url as proposer_avatar,
           r.name as reviewer_name
    FROM song_proposals p
    JOIN songs s ON s.id = p.song_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN users r ON r.id = p.reviewer_id
    ${isAdmin ? "" : "WHERE p.user_id = ?"}
    ORDER BY p.created_at DESC
  `,
    )
    .all(...(isAdmin ? [] : [req.user.id]))
  res.json(rows)
})

/* ── POST /api/proposals — proposar una cançó nova ─────────── */
router.post("/", requireAuth, (req, res) => {
  const { title, artist, key, capo = 0, content, language = "ca", tags = "" } = req.body
  if (!title || !artist || !key || !content)
    return res.status(400).json({ error: "Falten camps obligatoris" })

  const result = db.transaction(() => {
    // Inserir la cançó com a esborrany
    const songResult = db
      .prepare(
        `
      INSERT INTO songs (title, artist, key, capo, content, language, tags, draft)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `,
      )
      .run(title, artist, key, capo, content, language, tags)

    // Crear la proposta
    const proposalResult = db
      .prepare(
        `
      INSERT INTO song_proposals (user_id, song_id)
      VALUES (?, ?)
    `,
      )
      .run(req.user.id, songResult.lastInsertRowid)

    return { songId: songResult.lastInsertRowid, proposalId: proposalResult.lastInsertRowid }
  })()

  res.status(201).json(result)
})

/* ── PATCH /api/proposals/:id — aprovar o rebutjar (admin) ─── */
router.patch("/:id", requireAdmin, (req, res) => {
  const { status, notes = "" } = req.body
  if (!["approved", "rejected"].includes(status))
    return res.status(400).json({ error: 'Status ha de ser "approved" o "rejected"' })

  const proposal = db.prepare("SELECT * FROM song_proposals WHERE id = ?").get(req.params.id)
  if (!proposal) return res.status(404).json({ error: "Proposta no trobada" })
  if (proposal.status !== "pending")
    return res.status(400).json({ error: "La proposta ja ha estat revisada" })

  db.transaction(() => {
    db.prepare(
      `
      UPDATE song_proposals
      SET status=?, reviewer_id=?, notes=?, reviewed_at=datetime('now')
      WHERE id=?
    `,
    ).run(status, req.user.id, notes, proposal.id)

    if (status === "approved") {
      // Publicar la cançó
      db.prepare("UPDATE songs SET draft=0 WHERE id=?").run(proposal.song_id)
    } else {
      // Rebutjada → eliminar l'esborrany
      db.prepare("DELETE FROM songs WHERE id=?").run(proposal.song_id)
    }
  })()

  res.json({ ok: true })
})

/* ── GET /api/proposals/pending-count — badge per l'admin ──── */
router.get("/pending-count", requireAdmin, (req, res) => {
  const { n } = db.prepare("SELECT COUNT(*) as n FROM song_proposals WHERE status='pending'").get()
  res.json({ count: n })
})

module.exports = router
