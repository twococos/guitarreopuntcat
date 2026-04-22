const express = require("express")
const cors = require("cors")
const path = require("path")

const songsRouter = require("./routes/songs")
const pdfRouter = require("./routes/pdf")

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Servir el mòdul compartit
app.use("/shared", express.static(path.join(__dirname, "../shared")))

// Servir el frontend
app.use(express.static(path.join(__dirname, "../frontend")))

// Rutes de l'API
app.use("/api/songs", songsRouter)
app.use("/api/pdf", pdfRouter)

// Qualsevol altra ruta → index.html (SPA-friendly)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"))
})

app.listen(PORT, () => {
  console.log(`✅ Servidor actiu a http://localhost:${PORT}`)
})
