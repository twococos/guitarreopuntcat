const express = require("express")
const router = express.Router()
const fs = require("fs")
const puppeteer = require("puppeteer")
const db = require("../db")
const { transposeContent } = require("../transpose")

// POST /api/pdf/generate
// Body: { title, songs: [{ id, semitones }], order: [ids] }
router.post("/generate", async (req, res) => {
  const { title = "El meu cançoner", songs: songSelection = [] } = req.body

  if (!songSelection.length) {
    return res.status(400).json({ error: "No has seleccionat cap cançó" })
  }

  // Carregar cançons de la BD i aplicar transposició
  const songs = songSelection
    .map(({ id, semitones = 0 }) => {
      const song = db.prepare("SELECT * FROM songs WHERE id = ?").get(id)
      if (!song) return null
      return {
        ...song,
        content: transposeContent(song.content, semitones),
        displayKey: transposeKey(song.key, semitones),
      }
    })
    .filter(Boolean)

  // Generar HTML per a Puppeteer
  const html = buildHTML(title, songs)

  let browser
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    })
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="canconer.pdf"`,
    })
    res.send(pdf)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Error generant el PDF" })
  } finally {
    if (browser) await browser.close()
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────

function transposeKey(key, semitones) {
  const { transposeContent } = require("../transpose")
  // Reutilitzem el motor de transposició per al to
  return transposeContent(key, semitones)
}

function buildHTML(title, songs) {
  const pdfStylesSong = fs.readFileSync("frontend/song.css", "utf8")
  const pdfStylesBook = fs.readFileSync(__dirname + "/pdf-styles.css", "utf8")
  const toc = songs
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${s.title}</td><td>${s.artist}</td><td>${s.displayKey}</td></tr>`,
    )
    .join("")

  const pages = songs
    .map(
      (s) => `
    <section class="song-page">
      <h2 class="song-title">${s.title}</h2>
      <p class="song-meta">${s.artist} &nbsp;·&nbsp; To: ${s.displayKey}${s.capo ? ` &nbsp;·&nbsp; Cejilla: ${s.capo}` : ""}</p>
      <div class="song-content">${s.content}</div>
    </section>
  `,
    )
    .join("")

  return `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="UTF-8">
<style>
${pdfStylesSong}
${pdfStylesBook}
</style>
</head>
<body>

  <div class="cover">
    <h1>${title}</h1>
    <p>Generat el ${new Date().toLocaleDateString("ca-ES")}</p>
  </div>

  <div class="toc">
    <h2>Índex</h2>
    <table>${toc}</table>
  </div>

  ${pages}

</body>
</html>`
}

module.exports = router
