/* ── Estat global ──────────────────────────────────────────── */
const state = {
  songs: [], // llista completa de la BD
  activeSong: null, // cançó oberta al detall (objecte complet)
  semitones: 0, // transposició activa al detall
  canconer: [], // [{song, semitones}]
  dragIdx: null,
}

/* ── Helpers ───────────────────────────────────────────────── */
const API = (path, opts) => fetch(`/api${path}`, opts).then((r) => r.json())
const { transposeContent, transposeKey } = Transpose

/* ── Càrrega inicial ───────────────────────────────────────── */
async function loadSongs() {
  const sort = document.getElementById("sort").value
  const search = document.getElementById("search").value.trim()
  const params = new URLSearchParams({ sortBy: sort })
  if (search) params.set("search", search)
  state.songs = await API(`/songs?${params}`)
  renderSongList()
}

/* ── Render: llista de cançons ─────────────────────────────── */
function renderSongList() {
  const ul = document.getElementById("song-list")
  ul.innerHTML = ""
  if (!state.songs.length) {
    ul.innerHTML = '<li style="color:var(--muted);padding:.5rem">Cap cançó trobada</li>'
    return
  }
  state.songs.forEach((s) => {
    const li = document.createElement("li")
    if (state.activeSong?.id === s.id) li.classList.add("active")
    li.innerHTML = `
      <span class="song-key">${s.key}</span>
      <div class="song-name">${s.title}</div>
      <div class="song-info">${s.artist}</div>`
    li.addEventListener("click", () => openSong(s.id))
    ul.appendChild(li)
  })
}

/* ── Obrir cançó al detall ─────────────────────────────────── */
async function openSong(id) {
  const song = await API(`/songs/${id}`)
  state.activeSong = song
  state.semitones = 0
  renderDetail()
  renderSongList() // actualitza classe active
}

function renderDetail() {
  const s = state.activeSong
  if (!s) return

  document.getElementById("detail-empty").hidden = true
  document.getElementById("detail-content").hidden = false

  document.getElementById("detail-title").textContent = s.title
  document.getElementById("detail-meta").textContent =
    `${s.artist} · To original: ${s.key}${s.capo ? ` · Cejilla: ${s.capo}` : ""}`

  document.getElementById("transpose-value").textContent =
    (state.semitones >= 0 ? "+" : "") + state.semitones
  document.getElementById("display-key").textContent = `→ ${transposeKey(s.key, state.semitones)}`

  document.getElementById("detail-body").innerHTML = transposeContent(s.content, state.semitones)

  // Botó afegir: canvia si ja és al cançoner
  const alreadyIn = state.canconer.some((e) => e.song.id === s.id)
  const btn = document.getElementById("btn-add-to-canconer")
  btn.textContent = alreadyIn ? "✓ Ja és al cançoner" : "+ Afegir al cançoner"
  btn.disabled = alreadyIn
}

/* ── Transposició ──────────────────────────────────────────── */
document.getElementById("btn-up").addEventListener("click", () => {
  if (!state.activeSong) return
  state.semitones = (state.semitones + 1 + 12) % 12
  renderDetail()
})
document.getElementById("btn-down").addEventListener("click", () => {
  if (!state.activeSong) return
  state.semitones = (state.semitones - 1 + 12) % 12
  renderDetail()
})

/* ── Afegir al cançoner ────────────────────────────────────── */
document.getElementById("btn-add-to-canconer").addEventListener("click", () => {
  if (!state.activeSong) return
  if (state.canconer.some((e) => e.song.id === state.activeSong.id)) return
  state.canconer.push({ song: state.activeSong, semitones: state.semitones })
  renderDetail()
  renderCanconer()
})

/* ── Render: cançoner ──────────────────────────────────────── */
function renderCanconer() {
  const ul = document.getElementById("canconer-list")
  const empty = document.getElementById("canconer-empty")
  const btn = document.getElementById("btn-generate")
  const savedBtn = document.getElementById("btn-save-canconer")

  ul.innerHTML = ""
  const hasItems = state.canconer.length > 0
  empty.hidden = hasItems
  btn.disabled = !hasItems
  savedBtn.disabled = !hasItems

  state.canconer.forEach(({ song, semitones }, i) => {
    const displayKey = transposeKey(song.key, semitones)
    const li = document.createElement("li")
    li.draggable = true
    li.dataset.idx = i
    li.innerHTML = `
      <span class="c-num">${i + 1}</span>
      <div class="c-info">
        <div class="c-title">${song.title}</div>
        <div class="c-artist">${song.artist}</div>
      </div>
      <span class="c-key">${displayKey}</span>
      <button class="c-remove" title="Treure">✕</button>`

    li.querySelector(".c-remove").addEventListener("click", () => {
      state.canconer.splice(i, 1)
      renderCanconer()
      if (state.activeSong?.id === song.id) renderDetail()
    })

    // Drag & drop per reordenar
    li.addEventListener("dragstart", () => {
      state.dragIdx = i
      li.classList.add("dragging")
    })
    li.addEventListener("dragend", () => li.classList.remove("dragging"))
    li.addEventListener("dragover", (e) => {
      e.preventDefault()
      li.classList.add("drag-over")
    })
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"))
    li.addEventListener("drop", () => {
      li.classList.remove("drag-over")
      if (state.dragIdx === null || state.dragIdx === i) return
      const [moved] = state.canconer.splice(state.dragIdx, 1)
      state.canconer.splice(i, 0, moved)
      state.dragIdx = null
      renderCanconer()
    })

    ul.appendChild(li)
  })
}

/* ── Generar PDF ───────────────────────────────────────────── */
document.getElementById("btn-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generate")
  btn.disabled = true
  btn.textContent = "⏳ Generant…"

  try {
    const payload = {
      title: document.getElementById("canconer-title").value || "El meu cançoner",
      songs: state.canconer.map(({ song, semitones }) => ({ id: song.id, semitones })),
    }
    const res = await fetch("/api/pdf/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error("Error del servidor")
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "canconer.pdf"
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert("Error generant el PDF: " + err.message)
  } finally {
    btn.disabled = false
    btn.textContent = "📄 Generar PDF"
  }
})

/* ── Cerca i ordre ─────────────────────────────────────────── */
let searchTimer
document.getElementById("search").addEventListener("input", () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadSongs, 300)
})
document.getElementById("sort").addEventListener("change", loadSongs)

/* ── Guardar cançoner ──────────────────────────────────────── */
document.getElementById("btn-save-canconer").addEventListener("click", async () => {
  if (!Auth.isLoggedIn()) {
    if (!confirm("Has d'iniciar sessió per guardar el cançoner. Vols fer-ho ara?")) return
    Auth.login()
    return
  }
  // ... (el codi de generació de PDF ja existeix a dalt)
})

async function saveCanconer() {
  if (!Auth.isLoggedIn()) {
    Auth.login()
    return
  }
  const payload = {
    title: document.getElementById("canconer-title").value || "El meu cançoner",
    songs: state.canconer.map(({ song, semitones }) => ({ id: song.id, semitones })),
    id: state.savedCanconerId || undefined,
  }
  const res = await Auth.apiFetch("/canconers", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (res.ok) {
    const { id } = await res.json()
    state.savedCanconerId = id
    showToast("Cançoner guardat!")
  } else {
    showToast("Error guardant el cançoner", true)
  }
}

function showToast(msg, isError = false) {
  const t = document.createElement("div")
  t.className = `toast${isError ? " toast-error" : ""}`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}

/* ── Arrencada ─────────────────────────────────────────────── */
;(async () => {
  Auth.captureTokenFromURL()
  await Auth.loadUser()
  Auth.renderUserWidget("user-widget")
  loadSongs()
})()
