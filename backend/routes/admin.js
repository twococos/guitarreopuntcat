const express = require("express")
const db = require("../db")
const { requireAdmin } = require("../middleware/auth")

const router = express.Router()
// Totes les rutes d'aquest fitxer requereixen admin
router.use(requireAdmin)

/* ── GET /api/admin/users ───────────────────────────────────── */
router.get("/users", (req, res) => {
  const users = db
    .prepare(
      `
    SELECT u.*, COUNT(c.id) as canconer_count
    FROM users u
    LEFT JOIN canconers c ON c.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `,
    )
    .all()
  res.json(users)
})

/* ── PATCH /api/admin/users/:id — canviar rol o desactivar ─── */
router.patch("/users/:id", (req, res) => {
  const { role, active } = req.body
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)
  if (!user) return res.status(404).json({ error: "Usuari no trobat" })

  // No es pot degradar a si mateix
  if (parseInt(req.params.id) === req.user.id && role && role !== "admin")
    return res.status(400).json({ error: "No et pots treure el rol d'admin a tu mateix" })

  const updates = []
  const params = []
  if (role !== undefined) {
    updates.push("role=?")
    params.push(role)
  }
  if (active !== undefined) {
    updates.push("active=?")
    params.push(active ? 1 : 0)
  }
  if (!updates.length) return res.status(400).json({ error: "Res a actualitzar" })

  db.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).run(...params, req.params.id)
  res.json({ ok: true })
})

/* ── GET /api/admin/stats — resum general ───────────────────── */
router.get("/stats", (req, res) => {
  const stats = {
    songs: db.prepare("SELECT COUNT(*) as n FROM songs WHERE draft=0").get().n,
    drafts: db.prepare("SELECT COUNT(*) as n FROM songs WHERE draft=1").get().n,
    users: db.prepare("SELECT COUNT(*) as n FROM users").get().n,
    canconers: db.prepare("SELECT COUNT(*) as n FROM canconers").get().n,
    pending: db.prepare("SELECT COUNT(*) as n FROM song_proposals WHERE status='pending'").get().n,
  }
  res.json(stats)
})

module.exports = router
