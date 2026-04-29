/* ── Estat global ──────────────────────────────────────────── */
const state = {
  songs: [], // llista DB
  canconer: [], // [{ song, semitones }]
  selectedIdx: null, // índex seleccionat al cançoner
  previewActive: true,
  dragIdx: null,
  savedCanconerId: null,
  sortMode: 'custom', // 'custom' | 'title' | 'artist' | 'random'
  sortAsc: true,      // per a 'title' i 'artist'
}

const { transposeContent, transposeKey } = Transpose
const API = (path, opts) => fetch(`/api${path}`, opts).then((r) => r.json())

/* ── Col·lapsar panell lateral ─────────────────────────────── */
const btnCollapse = document.getElementById("btn-collapse-panel")
const collapseArrow = document.getElementById("collapse-arrow")

btnCollapse.addEventListener("click", () => {
  state.previewActive = !state.previewActive
  const layout = document.getElementById("main-layout")
  const inner = document.getElementById("panel-detail-inner")
  layout.classList.toggle("no-preview", !state.previewActive)
  inner.hidden = !state.previewActive
  collapseArrow.textContent = state.previewActive ? "›" : "‹"
  renderCanconer()
})

/* ── Pestanyes del panell lateral ──────────────────────────── */
document.querySelectorAll(".detail-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".detail-tab").forEach((t) => t.classList.remove("active"))
    document.querySelectorAll(".tab-content").forEach((c) => (c.hidden = true))
    tab.classList.add("active")
    document.getElementById(`tab-${tab.dataset.tab}`).hidden = false
  })
})

/* ── Ordenació del cançoner ─────────────────────────── */
function applyCancyonerSort(mode, asc) {
  if (mode === 'custom' || state.canconer.length === 0) return

  // Guardar quin és el seleccionat per restaurar-lo després
  const selectedSong = state.selectedIdx !== null ? state.canconer[state.selectedIdx] : null

  if (mode === 'title') {
    state.canconer.sort((a, b) => {
      const cmp = a.song.title.localeCompare(b.song.title, 'ca', { sensitivity: 'base' })
      return asc ? cmp : -cmp
    })
  } else if (mode === 'artist') {
    state.canconer.sort((a, b) => {
      const cmpArtist = a.song.artist.localeCompare(b.song.artist, 'ca', { sensitivity: 'base' })
      if (cmpArtist !== 0) return asc ? cmpArtist : -cmpArtist
      const cmpTitle = a.song.title.localeCompare(b.song.title, 'ca', { sensitivity: 'base' })
      return asc ? cmpTitle : -cmpTitle
    })
  } else if (mode === 'random') {
    // Fisher-Yates shuffle
    for (let i = state.canconer.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[state.canconer[i], state.canconer[j]] = [state.canconer[j], state.canconer[i]]
    }
  }

  // Restaurar selectedIdx
  if (selectedSong) {
    state.selectedIdx = state.canconer.indexOf(selectedSong)
  }
}

function updateSortUI() {
  const sel = document.getElementById('canconer-sort')
  const btnDir = document.getElementById('btn-sort-dir')
  const btnRand = document.getElementById('btn-sort-random')
  const dirIcon = document.getElementById('sort-dir-icon')

  if (sel) sel.value = state.sortMode
  if (btnDir) btnDir.hidden = !(state.sortMode === 'title' || state.sortMode === 'artist')
  if (btnRand) btnRand.hidden = state.sortMode !== 'random'
  if (dirIcon) dirIcon.textContent = state.sortAsc ? '↑' : '↓'
}

const sortSelect = document.getElementById('canconer-sort')
if (sortSelect) {
  sortSelect.addEventListener('change', () => {
    const newMode = sortSelect.value
    state.sortMode = newMode
    if (newMode !== 'custom') {
      applyCancyonerSort(newMode, state.sortAsc)
      renderSongList()
      renderCanconer()
      renderDetail()
    }
    updateSortUI()
  })
}

const btnSortDir = document.getElementById('btn-sort-dir')
if (btnSortDir) {
  btnSortDir.addEventListener('click', () => {
    state.sortAsc = !state.sortAsc
    applyCancyonerSort(state.sortMode, state.sortAsc)
    updateSortUI()
    renderSongList()
    renderCanconer()
    renderDetail()
  })
}

const btnSortRandom = document.getElementById('btn-sort-random')
if (btnSortRandom) {
  btnSortRandom.addEventListener('click', () => {
    applyCancyonerSort('random', state.sortAsc)
    renderSongList()
    renderCanconer()
    renderDetail()
  })
}

/* ── Filtre de tonalitats permeses ───────────────────────── */
// Totes les 12 tonalitats majors (i implicitament els seus relatius menors)
// CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
// Per a cada to major, el seu relatiu menor és el to 9 semitons per sobre (o 3 per sota)
const ALL_MAJOR_KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
// Relatiu menor de cada major: C->Am, C#->A#m, D->Bm, D#->Cm, E->C#m, F->Dm, F#->D#m, G->Em, G#->Fm, A->F#m, A#->Gm, B->G#m
const RELATIVE_MINOR = {
  'C':'Am','C#':'A#m','D':'Bm','D#':'Cm','E':'C#m','F':'Dm',
  'F#':'D#m','G':'Em','G#':'Fm','A':'F#m','A#':'Gm','B':'G#m'
}

// Conjunt de tonalitats majors permeses (totes activades per defecte)
// state.allowedKeys = Set de tonalitats MAJORS permeses
// La tonalitat d'una cançó és permesa si la seva arrel major està a allowedKeys
// (tant si la cançó és major com si és la menor relativa)
state.allowedKeys = new Set(ALL_MAJOR_KEYS)

// Donat un to (major o menor), retorna la seva arrel major equivalent
function toMajorRoot(key) {
  const root = key.replace('m', '')
  // Si és menor, busquem el major del qual és relatiu
  if (key.endsWith('m') && key !== 'F' && key !== 'C') {
    // El relatiu major d'un menor: 3 semitons per sobre
    const CHROM = Transpose.CHROMATIC
    const idx = CHROM.indexOf(root)
    if (idx !== -1) {
      const majorIdx = (idx + 3) % 12
      return CHROM[majorIdx]
    }
  }
  return root // és major, retornem l'arrel directament
}

// Donat un to i el conjunt de permesos, troba el to permès més proper en semitons
// Retorna quants semitons cal afegir (pot ser negatiu, usem el mínim distància circular)
function nearestAllowedSemitones(currentKey, allowedMajors) {
  const CHROM = Transpose.CHROMATIC
  const currentRoot = currentKey.replace('m', '')
  const isMinor = currentKey.endsWith('m') && currentKey !== 'F' && currentKey !== 'C'
  const currentIdx = CHROM.indexOf(currentRoot)
  if (currentIdx === -1) return 0

  let bestDelta = null
  let bestDist = Infinity

  for (const major of allowedMajors) {
    const majorIdx = CHROM.indexOf(major)
    if (majorIdx === -1) continue

    // Si la cançó és menor, la tonalitat permesa corresponent és el relatiu menor del major permès
    // Per saber quants semitons cal, calculem la distància entre les arrels
    const delta = (majorIdx - currentIdx + 12) % 12
    // distància circular mínima
    const dist = delta <= 6 ? delta : 12 - delta
    if (dist < bestDist) {
      bestDist = dist
      bestDelta = delta <= 6 ? delta : delta - 12
    }
  }
  return bestDelta ?? 0
}

function renderKeyFilterGrid() {
  const grid = document.getElementById('key-filter-grid')
  if (!grid) return
  grid.innerHTML = ''
  ALL_MAJOR_KEYS.forEach((key) => {
    const btn = document.createElement('button')
    btn.className = 'key-filter-btn' + (state.allowedKeys.has(key) ? ' active' : '')
    btn.innerHTML = `<span class="kf-major">${key}</span><span class="kf-minor">${RELATIVE_MINOR[key]}</span>`
    btn.title = `${key} major / ${RELATIVE_MINOR[key]}`
    btn.addEventListener('click', () => {
      if (state.allowedKeys.has(key)) {
        // No podem deixar cap tonalitat activa
        if (state.allowedKeys.size <= 1) return
        state.allowedKeys.delete(key)
      } else {
        state.allowedKeys.add(key)
      }
      btn.classList.toggle('active', state.allowedKeys.has(key))
    })
    grid.appendChild(btn)
  })
}

document.getElementById('btn-apply-keys')?.addEventListener('click', () => {
  if (state.canconer.length === 0) return
  const CHROM = Transpose.CHROMATIC
  const allowed = state.allowedKeys

  state.canconer.forEach((entry) => {
    const originalKey = entry.song.key  // to original de la cançó a la BD
    const originalMajorRoot = toMajorRoot(originalKey)

    if (allowed.has(originalMajorRoot)) {
      // El to original està permès: restaurem semitones = 0
      entry.semitones = 0
    } else {
      // Cal transposar: calculem el to actual transposat
      const currentRoot = CHROM[(CHROM.indexOf(originalKey.replace('m','')) + entry.semitones + 12) % 12]
      const isMinor = originalKey.endsWith('m') && originalKey !== 'F' && originalKey !== 'C'
      const currentKey = isMinor ? currentRoot + 'm' : currentRoot
      const currentMajorRoot = toMajorRoot(currentKey)

      if (allowed.has(currentMajorRoot)) {
        // El to actual ja és permès, no cal fer res
        return
      }

      // Busquem el to permès més proper partint del to ORIGINAL
      const origRootIdx = CHROM.indexOf(originalKey.replace('m',''))
      let bestDelta = 0
      let bestDist = Infinity

      for (const major of allowed) {
        const majorIdx = CHROM.indexOf(major)
        // Per cançons menors, la tonalitat resultant serà el relatiu menor del major permès
        // Per cançons majors, la tonalitat resultant serà el major permès directament
        // En tots dos casos, l'arrel de destino és el major permès
        const delta = (majorIdx - origRootIdx + 12) % 12
        const dist = delta <= 6 ? delta : 12 - delta
        if (dist < bestDist) {
          bestDist = dist
          bestDelta = delta <= 6 ? delta : delta - 12
          if (bestDelta < 0) bestDelta = (bestDelta + 12) % 12
        }
      }
      entry.semitones = bestDelta
    }
  })

  renderCanconer()
  renderDetail()
  showToast('Tonalitats aplicades!')
})

// Inicialitzar la graella en carregar
renderKeyFilterGrid()

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
      // El drag & drop marca l'ordre com a personalitzat
      state.sortMode = 'custom'
      updateSortUI()
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
