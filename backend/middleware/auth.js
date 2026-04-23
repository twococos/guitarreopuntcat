const jwt = require("jsonwebtoken")
const db = require("../db")

/**
 * Extreu i verifica el JWT de la capçalera Authorization.
 * Afegeix req.user si és vàlid.
 */
function verifyToken(req, res, next) {
  const header = req.headers["authorization"] || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: "No autenticat" })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(payload.id)
    if (!user) return res.status(401).json({ error: "Usuari no trobat o desactivat" })
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: "Token invàlid o expirat" })
  }
}

/** Requereix login (pot ser opcional en algunes rutes). */
function requireAuth(req, res, next) {
  verifyToken(req, res, next)
}

/** Requereix rol d'administrador. */
function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Accés restringit a administradors" })
    }
    next()
  })
}

/**
 * Afegeix req.user si hi ha token vàlid, però no bloqueja si no n'hi ha.
 * Útil per a rutes públiques que es comporten diferent si estàs autenticat.
 */
function optionalAuth(req, res, next) {
  const header = req.headers["authorization"] || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) return next()
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(payload.id)
  } catch {
    /* token invàlid, continuem com a guest */
  }
  next()
}

module.exports = { requireAuth, requireAdmin, optionalAuth }
