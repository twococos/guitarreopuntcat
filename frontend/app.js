/* ── Estat global ──────────────────────────────────────────── */
const state = {
  songs: [], // llista DB
  canconer: [], // [{ song, semitones }]
  selectedIdx: null, // índex seleccionat al cançoner
  previewActive: true,
  dragIdx: null,
  savedCanconerId: null,
}

const { transposeContent, transposeKey } = Transpose
const API = (path, opts) => fetch(`/api${path}`, opts).then((r) => r.json())

/* ── Toggle vista prèvia ───────────────────────────────────── */
const btnToggle = document.getElementById("btn-toggle-preview")
btnToggle.classList.add("active")

btnToggle.addEventListener("click", () => {
  state.previewActive = !state.previewActive
  btnToggle.classList.toggle("active", state.previewActive)
  document.getElementById("main-layout").classList.toggle("no-preview", !state.previewActive)
  document.getElementById("panel-detail").hidden = !state.previewActive
  renderCanconer()
})

/* ── Botó nova cançó ───────────────────────────────────────── */
function updateNewSongButton() {
  const btn = document.getElementById("btn-new-song")
  if (!btn) return
  const user = Auth.getUser()
  if (!user) {
    btn.textContent = "+ Proposa una cançó"
    btn.removeAttribute("href")
    btn.addEventListener("click", (e) => {
      e.preventDefault()
      showProposeToast()
    })
  } else if (Auth.isAdmin()) {
    btn.textContent = "+ Nova cançó"
    btn.setAttribute("href", "/editor.html")
  } else {
    btn.textContent = "+ Proposa una cançó"
    btn.setAttribute("href", "/editor.html")
  }
}

function showProposeToast() {
  document.getElementById("propose-login-toast").hidden = false
}
document.getElementById("propose-toast-close")?.addEventListener("click", () => {
  document.getElementById("propose-login-toast").hidden = true
})
document.getElementById("propose-login-btn")?.addEventListener("click", () => {
  Auth.createLoginPopup()
  document.getElementById("propose-login-toast").hidden = true
})

/* ── Càrrega de cançons DB ─────────────────────────────────── */
async function loadSongs() {
  const sort = document.getElementById("sort").value
  const search = document.getElementById("search").value.trim()
  const params = new URLSearchParams({ sortBy: sort })
  if (search) params.set("search", search)
  state.songs = await API(`/songs?${params}`)
  renderSongList()
}

function renderSongList() {
  const ul = document.getElementById("song-list")
  ul.innerHTML = ""
  const inCanconer = new Set(state.canconer.map((e) => e.song.id))

  state.songs.forEach((s) => {
    const li = document.createElement("li")
    const already = inCanconer.has(s.id)
    if (already) li.classList.add("in-canconer")
    li.innerHTML = `
      <span class="song-key">${s.key}</span>
      <div class="song-name">${s.title}</div>
      <div class="song-info">${s.artist}</div>`
    if (!already) {
      li.addEventListener("click", () => addToCanconer(s.id))
    }
    ul.appendChild(li)
  })
}

/* ── Afegir al cançoner ────────────────────────────────────── */
async function addToCanconer(songId) {
  // Carregar dades completes si no les tenim
  let song = state.songs.find((s) => s.id === songId)
  if (!song?.content) song = await API(`/songs/${songId}`)

  state.canconer.push({ song, semitones: 0 })
  // Seleccionar la cançó afegida
  state.selectedIdx = state.canconer.length - 1
  renderSongList()
  renderCanconer()
  renderDetail()
}

/* ── Render: cançoner ──────────────────────────────────────── */
function renderCanconer() {
  const empty = document.getElementById("canconer-empty")
  const list = document.getElementById("canconer-list")
  const grid = document.getElementById("canconer-grid")
  const btnSave = document.getElementById("btn-save-canconer")
  const btnPDF = document.getElementById("btn-generate")

  const hasItems = state.canconer.length > 0
  empty.hidden = hasItems
  btnSave.disabled = !hasItems
  btnPDF.disabled = !hasItems
  updateSaveButton()

  if (state.previewActive) {
    list.hidden = false
    grid.hidden = true
    renderList()
  } else {
    list.hidden = true
    grid.hidden = false
    renderGrid()
  }
}

/* Mode llista (vista prèvia activa) */
function renderList() {
  const ul = document.getElementById("canconer-list")
  ul.innerHTML = ""

  state.canconer.forEach(({ song, semitones }, i) => {
    const key = transposeKey(song.key, semitones)
    const li = document.createElement("li")
    li.draggable = true
    if (i === state.selectedIdx) li.classList.add("selected")

    li.innerHTML = `
      <span class="c-num">${i + 1}</span>
      <span class="c-title">${song.title}</span>
      <span class="c-artist">${song.artist}</span>
      <div class="c-transpose">
        <button class="c-pm c-btn-down" title="−1 semitò">−</button>
        <span class="c-key" title="Canviar tonalitat">${key}</span>
        <button class="c-pm c-btn-up" title="+1 semitò">+</button>
      </div>
      <button class="c-remove" title="Treure">✕</button>`

    // Seleccionar
    li.addEventListener("click", (e) => {
      if (e.target.closest(".c-transpose") || e.target.classList.contains("c-remove")) return
      state.selectedIdx = i
      renderCanconer()
      renderDetail()
    })

    // Clic sobre la tonalitat → menú
    li.querySelector(".c-key").addEventListener("click", (e) => {
      e.stopPropagation()
      openKeyMenu(i, e.currentTarget)
    })

    // +/−
    li.querySelector(".c-btn-up").addEventListener("click", (e) => {
      e.stopPropagation()
      state.canconer[i].semitones = (semitones + 1 + 12) % 12
      if (state.selectedIdx === i) renderDetail()
      renderCanconer()
    })
    li.querySelector(".c-btn-down").addEventListener("click", (e) => {
      e.stopPropagation()
      state.canconer[i].semitones = (semitones - 1 + 12) % 12
      if (state.selectedIdx === i) renderDetail()
      renderCanconer()
    })

    // Eliminar
    li.querySelector(".c-remove").addEventListener("click", (e) => {
      e.stopPropagation()
      state.canconer.splice(i, 1)
      if (state.selectedIdx >= state.canconer.length) state.selectedIdx = state.canconer.length - 1
      if (state.canconer.length === 0) state.selectedIdx = null
      renderSongList()
      renderCanconer()
      renderDetail()
    })

    // Drag & drop
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
      if (state.selectedIdx === state.dragIdx) state.selectedIdx = i
      else if (state.selectedIdx > state.dragIdx && state.selectedIdx <= i) state.selectedIdx--
      else if (state.selectedIdx < state.dragIdx && state.selectedIdx >= i) state.selectedIdx++
      state.dragIdx = null
      renderCanconer()
    })

    ul.appendChild(li)
  })
}

/* Mode grid — column-count omple verticalment */
function renderGrid() {
  const grid = document.getElementById("canconer-grid")
  grid.innerHTML = ""
  state.canconer.forEach(({ song, semitones }, i) => {
    const key = transposeKey(song.key, semitones)
    const div = document.createElement("div")
    div.className = "cg-item"
    if (i === state.selectedIdx) div.classList.add("selected")
    div.innerHTML = `
      <span class="cg-num">${i + 1}</span>
      <span class="cg-title">${song.title}</span>
      <span class="cg-artist">${song.artist}</span>
      <div class="cg-transpose">
        <button class="cg-pm cg-btn-down">−</button>
        <span class="cg-key" title="Canviar tonalitat">${key}</span>
        <button class="cg-pm cg-btn-up">+</button>
      </div>`

    div.addEventListener("click", (e) => {
      if (e.target.closest(".cg-transpose")) return
      state.selectedIdx = i
      renderGrid()
    })
    div.querySelector(".cg-key").addEventListener("click", (e) => {
      e.stopPropagation()
      openKeyMenu(i, e.currentTarget)
    })
    div.querySelector(".cg-btn-up").addEventListener("click", (e) => {
      e.stopPropagation()
      state.canconer[i].semitones = (semitones + 1 + 12) % 12
      renderGrid()
    })
    div.querySelector(".cg-btn-down").addEventListener("click", (e) => {
      e.stopPropagation()
      state.canconer[i].semitones = (semitones - 1 + 12) % 12
      renderGrid()
    })
    grid.appendChild(div)
  })
}

/* ── Vista prèvia del detall ───────────────────────────────── */
function renderDetail() {
  if (!state.previewActive) return
  const emptyEl = document.getElementById("detail-empty")
  const contentEl = document.getElementById("detail-content")

  if (state.selectedIdx === null || !state.canconer[state.selectedIdx]) {
    emptyEl.hidden = false
    contentEl.hidden = true
    return
  }
  const { song, semitones } = state.canconer[state.selectedIdx]
  emptyEl.hidden = true
  contentEl.hidden = false

  document.getElementById("detail-title").textContent = song.title
  document.getElementById("detail-meta").textContent =
    `${song.artist} · To original: ${song.key}${song.capo ? ` · Cejilla: ${song.capo}` : ""}`
  document.getElementById("transpose-value").textContent = (semitones >= 0 ? "+" : "") + semitones
  document.getElementById("display-key").textContent = `→ ${transposeKey(song.key, semitones)}`
  document.getElementById("detail-body").innerHTML = transposeContent(song.content, semitones)
}

/* Botons de transposició del detall */
document.getElementById("btn-up").addEventListener("click", () => {
  if (state.selectedIdx === null) return
  const e = state.canconer[state.selectedIdx]
  e.semitones = (e.semitones + 1 + 12) % 12
  renderCanconer()
  renderDetail()
})
document.getElementById("btn-down").addEventListener("click", () => {
  if (state.selectedIdx === null) return
  const e = state.canconer[state.selectedIdx]
  e.semitones = (e.semitones - 1 + 12) % 12
  renderCanconer()
  renderDetail()
})

/* ── Menú de tonalitats ────────────────────────────────────── */
const keyMenu = document.getElementById("key-menu")
const keyMenuGrid = document.getElementById("key-menu-grid")
let keyMenuTarget = null // { idx }

const CHROMATIC = Transpose.CHROMATIC
// Genera 12 tonalitats del mateix mode (major/menor) que la cançó original
function keysForSong(originalKey) {
  const isMinor = originalKey.endsWith("m") && originalKey !== "F" && originalKey !== "C"
  return CHROMATIC.map((n) => (isMinor ? n + "m" : n))
}

function openKeyMenu(idx, anchorEl) {
  keyMenuTarget = idx
  const { song, semitones } = state.canconer[idx]
  const currentKey = Transpose.transposeKey(song.key, semitones)
  const keys = keysForSong(song.key)

  keyMenuGrid.innerHTML = ""
  keys.forEach((k) => {
    const btn = document.createElement("button")
    btn.textContent = k
    if (k === currentKey) btn.classList.add("current")
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault()
      // Calcular quants semitons cal per arribar a aquesta tonalitat
      const rootOrig = song.key.replace("m", "")
      const rootTarget = k.replace("m", "")
      const iOrig = CHROMATIC.indexOf(rootOrig)
      const iTarget = CHROMATIC.indexOf(rootTarget)
      state.canconer[idx].semitones = (iTarget - iOrig + 12) % 12
      closeKeyMenu()
      renderCanconer()
      if (state.selectedIdx === idx) renderDetail()
    })
    keyMenuGrid.appendChild(btn)
  })

  // Posicionar el menú
  keyMenu.hidden = false
  const rect = anchorEl.getBoundingClientRect()
  const mw = keyMenu.offsetWidth,
    mh = keyMenu.offsetHeight
  const vw = window.innerWidth,
    vh = window.innerHeight
  keyMenu.style.left = Math.min(rect.left, vw - mw - 8) + "px"
  keyMenu.style.top = (rect.bottom + 4 + mh > vh ? rect.top - mh - 4 : rect.bottom + 4) + "px"
}

function closeKeyMenu() {
  keyMenu.hidden = true
  keyMenuTarget = null
}
document.addEventListener("click", closeKeyMenu)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeKeyMenu()
})
keyMenu.addEventListener("click", (e) => e.stopPropagation())
document.getElementById("btn-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generate")
  btn.disabled = true
  const orig = btn.textContent
  btn.textContent = "⏳"
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
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "canconer.pdf"
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    alert("Error generant el PDF.")
  } finally {
    btn.disabled = false
    btn.textContent = orig
    updateSaveButton()
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
function updateSaveButton() {
  const btn = document.getElementById("btn-save-canconer")
  const has = state.canconer.length > 0
  btn.disabled = !has
  btn.title = !has
    ? "Afegeix cançons primer"
    : Auth.isLoggedIn()
      ? "Guardar cançoner"
      : "Inicia sessió per guardar"
}

document.getElementById("btn-save-canconer").addEventListener("click", () => {
  if (!Auth.isLoggedIn()) {
    Auth.createLoginPopup()
    return
  }
  saveCanconer()
})

async function saveCanconer() {
  let existingCanconers = []
  try {
    const r = await Auth.apiFetch("/canconers")
    existingCanconers = await r.json()
  } catch {}

  const titleInput = document.getElementById("canconer-title").value.trim() || "El meu cançoner"
  const songs = state.canconer.map(({ song, semitones }) => ({ id: song.id, semitones }))

  const duplicate = existingCanconers.find(
    (c) => c.title.toLowerCase() === titleInput.toLowerCase() && c.id !== state.savedCanconerId,
  )
  if (duplicate) {
    showOverwriteToast(titleInput, duplicate.id, songs)
    return
  }
  await doSave(titleInput, songs, state.savedCanconerId)
}

function showOverwriteToast(title, duplicateId, songs) {
  document.getElementById("overwrite-toast")?.remove()
  const t = document.createElement("div")
  t.id = "overwrite-toast"
  t.className = "overwrite-toast"
  t.innerHTML = `
    <span>⚠️</span>
    <p>Ja tens un cançoner <strong>"${title}"</strong>. Vols sobreescriure'l?</p>
    <button id="ow-yes" class="btn-primary btn-sm">Sobreescriu</button>
    <button id="ow-no" class="btn-ghost">Cancel·lar</button>`
  document.body.appendChild(t)
  document.getElementById("ow-yes").addEventListener("click", async () => {
    t.remove()
    await doSave(title, songs, duplicateId)
    state.savedCanconerId = duplicateId
  })
  document.getElementById("ow-no").addEventListener("click", () => t.remove())
  setTimeout(() => t?.remove(), 8000)
}

async function doSave(title, songs, existingId) {
  const payload = { title, songs, id: existingId || undefined }
  const res = await Auth.apiFetch("/canconers", { method: "POST", body: JSON.stringify(payload) })
  if (res.ok) {
    const { id } = await res.json()
    state.savedCanconerId = id
    showToast("Cançoner guardat!")
  } else {
    showToast("Error guardant el cançoner", true)
  }
}

async function setDefaultTitle() {
  if (!Auth.isLoggedIn()) return
  try {
    const r = await Auth.apiFetch("/canconers")
    const existing = await r.json()
    const titles = new Set(existing.map((c) => c.title.toLowerCase()))
    let title = "El meu cançoner"
    let n = 2
    while (titles.has(title.toLowerCase())) title = `El meu cançoner ${n++}`
    document.getElementById("canconer-title").value = title
  } catch {}
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
  updateNewSongButton()
  updateSaveButton()

  const saved = sessionStorage.getItem("load_canconer")
  if (saved) {
    sessionStorage.removeItem("load_canconer")
    const canconer = JSON.parse(saved)
    state.savedCanconerId = canconer.id
    document.getElementById("canconer-title").value = canconer.title
    for (const s of canconer.songs) {
      const full = await (await fetch(`/api/songs/${s.id}`)).json()
      state.canconer.push({ song: full, semitones: s.semitones })
    }
    state.selectedIdx = state.canconer.length > 0 ? 0 : null
    renderSongList()
    renderCanconer()
    renderDetail()
  } else {
    await setDefaultTitle()
  }
  loadSongs()
})()
