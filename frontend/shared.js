const { transposeKey, transposeContent } = Transpose

/* ── Carregar el cançoner des del token de la URL ──────────── */
const token = location.pathname.split("/c/")[1]
if (!token) {
  location.href = "/"
}

;(async () => {
  try {
    const res = await fetch(`/api/canconers/shared/${token}`)
    if (!res.ok) throw new Error()
    const data = await res.json()
    render(data)
  } catch {
    document.getElementById("shared-loading").innerHTML =
      "<span>❌</span><p>Cançoner no trobat o l'enllaç ja no és vàlid.</p>"
  }
})()

/* ── Renderitzar ───────────────────────────────────────────── */
function render(canconer) {
  document.title = `${canconer.title} — Cançoner`
  document.getElementById("shared-title").textContent = canconer.title
  document.getElementById("shared-meta").textContent =
    `Per ${canconer.owner_name} · ${canconer.songs.length} cançons`

  const main = document.getElementById("shared-songs")
  const index = document.getElementById("shared-index")
  main.innerHTML = ""
  index.innerHTML = ""

  canconer.songs.forEach((s, i) => {
    const displayKey = transposeKey(s.key, s.semitones)
    const content = transposeContent(s.content, s.semitones)
    const id = `song-${s.id}`

    // Targeta de la cançó
    const card = document.createElement("article")
    card.className = "song-card"
    card.id = id
    card.innerHTML = `
      <div class="song-card-header">
        <div>
          <h2>${s.title}</h2>
          <p class="song-card-meta">${s.artist}${s.capo ? ` · Cejilla ${s.capo}` : ""}</p>
        </div>
        <span class="song-card-key">${displayKey}</span>
      </div>
      <div class="song-card-body">${content}</div>`
    main.appendChild(card)

    // Entrada a l'índex
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = `#${id}`
    a.textContent = s.title
    li.appendChild(a)
    index.appendChild(li)
  })

  // Eliminar l'indicador de càrrega
  document.getElementById("shared-loading")?.remove()

  // Ressaltar l'entrada de l'índex al fer scroll
  setupScrollSpy(canconer.songs.map((s) => `song-${s.id}`))

  // PDF
  document.getElementById("btn-pdf").addEventListener("click", () => generatePDF(canconer))
}

/* ── Scroll spy per a l'índex ──────────────────────────────── */
function setupScrollSpy(ids) {
  const links = document.querySelectorAll("#shared-index a")
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) =>
            l.classList.toggle("active", l.getAttribute("href") === `#${e.target.id}`),
          )
        }
      })
    },
    { rootMargin: "-30% 0px -60% 0px" },
  )

  ids.forEach((id) => {
    const el = document.getElementById(id)
    if (el) obs.observe(el)
  })
}

/* ── Generar PDF ───────────────────────────────────────────── */
async function generatePDF(canconer) {
  const btn = document.getElementById("btn-pdf")
  btn.disabled = true
  btn.textContent = "⏳ Generant…"

  try {
    const payload = {
      title: canconer.title,
      songs: canconer.songs.map((s) => ({ id: s.id, semitones: s.semitones })),
    }
    const res = await fetch("/api/pdf/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${canconer.title}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    alert("Error generant el PDF.")
  } finally {
    btn.disabled = false
    btn.textContent = "📄 Descarregar PDF"
  }
}
