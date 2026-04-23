require("dotenv").config()
const express = require("express")
const cors = require("cors")
const path = require("path")

const authRouter = require("./routes/auth")
const songsRouter = require("./routes/songs")
const pdfRouter = require("./routes/pdf")
const canconersRouter = require("./routes/canconers")
const proposalsRouter = require("./routes/proposals")
const adminRouter = require("./routes/admin")

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Servir el mòdul compartit
app.use("/shared", express.static(path.join(__dirname, "../shared")))

// Servir el frontend
app.use(express.static(path.join(__dirname, "../frontend")))

// Rutes de l'API
app.use("/api/auth", authRouter)
app.use("/api/songs", songsRouter)
app.use("/api/pdf", pdfRouter)
app.use("/api/canconers", canconersRouter)
app.use("/api/proposals", proposalsRouter)
app.use("/api/admin", adminRouter)

// Ruta compartida pública: /c/:token
app.get("/c/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/shared.html"))
})

// Qualsevol altra ruta → index.html (SPA-friendly) (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
})

app.listen(PORT, () => {
  console.log(`✅ Servidor actiu a http://localhost:${PORT}`)
})
