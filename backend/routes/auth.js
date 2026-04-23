const express = require("express")
const { OAuth2Client } = require("google-auth-library")
const jwt = require("jsonwebtoken")
const db = require("../db")

const router = express.Router()
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.APP_URL}/api/auth/google/callback`,
)

/* ── Pas 1: redirigir a Google ─────────────────────────────── */
router.get("/google", (req, res) => {
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
  })
  res.redirect(url)
})

/* ── Pas 2: callback de Google ─────────────────────────────── */
router.get("/google/callback", async (req, res) => {
  const { code } = req.query
  if (!code) return res.redirect("/?auth=error")

  try {
    // Bescanviar el codi pel token de Google
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)

    // Obtenir el perfil de l'usuari
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const { sub: googleId, email, name, picture } = ticket.getPayload()

    // Crear o actualitzar l'usuari a la BD
    let user = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId)

    if (!user) {
      // Primer usuari → admin automàticament
      const count = db.prepare("SELECT COUNT(*) as n FROM users").get().n
      const role = count === 0 ? "admin" : "user"
      const result = db
        .prepare(
          `
        INSERT INTO users (google_id, email, name, avatar_url, role)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(googleId, email, name, picture, role)
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid)
    } else {
      // Actualitzar dades del perfil per si han canviat
      db.prepare("UPDATE users SET name=?, avatar_url=?, email=? WHERE id=?").run(
        name,
        picture,
        email,
        user.id,
      )
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)
    }

    // Emetre JWT propi
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    })

    // Redirigir al frontend amb el token
    res.redirect(`/?token=${token}`)
  } catch (err) {
    console.error("OAuth error:", err)
    res.redirect("/?auth=error")
  }
})

/* ── GET /api/auth/me — perfil de l'usuari actual ──────────── */
router.get("/me", (req, res) => {
  const header = req.headers["authorization"] || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return res.json({ user: null })

  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET)
    const user = db
      .prepare(
        "SELECT id, name, email, avatar_url, role, created_at FROM users WHERE id = ? AND active = 1",
      )
      .get(id)
    res.json({ user: user || null })
  } catch {
    res.json({ user: null })
  }
})

/* ── POST /api/auth/logout — (el JWT es invalida al client) ── */
router.post("/logout", (req, res) => res.json({ ok: true }))

module.exports = router
