/* ════════════════════════════════════════════════════════════
   editor.js
   ════════════════════════════════════════════════════════════ */

const { ALL_KEYS, chordsForKey } = Transpose

/* ── Constants ─────────────────────────────────────────────── */
const DRAFT_KEY = "editor_draft" // sessionStorage key
const EDIT_PARAM = "id" // ?id=N → mode edició

/* ── Detecció de mode ──────────────────────────────────────── */
const editId = new URLSearchParams(location.search).get(EDIT_PARAM)
const isEdit = !!editId

/* ── Autenticació ──────────────────────────────────────────── */
;(async () => {
  Auth.captureTokenFromURL()
  const user = await Auth.loadUser()

  // Redirigir si no autenticat
  if (!user) {
    location.href = "/"
    return
  }

  Auth.renderUserWidget("user-widget")

  // Títol i botó guardar segons rol
  const isAdmin = Auth.isAdmin()
  if (isEdit) {
    document.getElementById("editor-title").textContent = "✏️ Editar cançó"
    document.getElementById("editor-subtitle").textContent = "Modifica i guarda els canvis"
    document.getElementById("btn-save").textContent = "💾 Guardar canvis"
    await loadSongForEdit(editId)
  } else {
    document.getElementById("btn-save").textContent = isAdmin
      ? "💾 Guardar cançó"
      : "📤 Enviar proposta"
    // Mostrar popup informatiu si no és admin
    if (!isAdmin) {
      const accepted = sessionStorage.getItem("propose_info_accepted")
      if (!accepted) showProposeInfo()
    }
    // Restaurar esborrany si n'hi ha
    restoreDraft()
  }
  buildChordUI()
  updateHighlight()
})()

/* ── Popup informatiu de proposta ──────────────────────────── */
function showProposeInfo() {
  document.getElementById("propose-info-overlay").hidden = false
}
document.getElementById("btn-propose-accept").addEventListener("click", () => {
  sessionStorage.setItem("propose_info_accepted", "1")
  document.getElementById("propose-info-overlay").hidden = true
})

/* ── Carregar cançó per editar ─────────────────────────────── */
async function loadSongForEdit(id) {
  try {
    const res = await Auth.apiFetch(`/songs/${id}`)
    if (!res.ok) throw new Error()
    const song = await res.json()
    document.getElementById("meta-title").value = song.title
    document.getElementById("meta-artist").value = song.artist
    document.getElementById("meta-key").value = song.key
    document.getElementById("meta-capo").value = song.capo ?? 0
    document.getElementById("meta-language").value = song.language ?? "ca"
    document.getElementById("meta-tags").value = song.tags ?? ""
    editor.value = song.content
    updateHighlight()
  } catch {
    alert("No s'ha pogut carregar la cançó.")
    location.href = "/"
  }
}

/* ── Esborrany automàtic (sessionStorage) ──────────────────── */
function saveDraft() {
  if (isEdit) return // no guardem esborrany en mode edició
  const draft = {
    title: document.getElementById("meta-title").value,
    artist: document.getElementById("meta-artist").value,
    key: document.getElementById("meta-key").value,
    capo: document.getElementById("meta-capo").value,
    language: document.getElementById("meta-language").value,
    tags: document.getElementById("meta-tags").value,
    content: editor.value,
  }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

function restoreDraft() {
  const raw = sessionStorage.getItem(DRAFT_KEY)
  if (!raw) return
  try {
    const d = JSON.parse(raw)
    if (d.title) document.getElementById("meta-title").value = d.title
    if (d.artist) document.getElementById("meta-artist").value = d.artist
    if (d.key) document.getElementById("meta-key").value = d.key
    if (d.capo) document.getElementById("meta-capo").value = d.capo
    if (d.language) document.getElementById("meta-language").value = d.language
    if (d.tags) document.getElementById("meta-tags").value = d.tags
    if (d.content) editor.value = d.content
  } catch {}
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

/* ── Inicialitzar selector de tons ─────────────────────────── */
const selKey = document.getElementById("meta-key")
ALL_KEYS.forEach((k) => {
  const opt = document.createElement("option")
  opt.value = opt.textContent = k
  selKey.appendChild(opt)
})
selKey.value = "Am"

/* ── Elements ──────────────────────────────────────────────── */
const editor = document.getElementById("editor")
const highlight = document.getElementById("editor-highlight")
const chordMenu = document.getElementById("chord-menu")
const menuGroups = document.getElementById("chord-menu-groups")
const preview = document.getElementById("preview-panel")
const previewBody = document.getElementById("preview-body")
const palette = document.getElementById("chord-palette")
const saveStatus = document.getElementById("save-status")

/* ── Historial d'undo/redo propi ───────────────────────────── */
const history = { stack: [], idx: -1, ignoreNext: false }

function historyPush(val) {
  // Eliminar el futur si estem a mig historial
  history.stack = history.stack.slice(0, history.idx + 1)
  history.stack.push(val)
  history.idx = history.stack.length - 1
}

function historyUndo() {
  if (history.idx <= 0) return
  history.idx--
  history.ignoreNext = true
  editor.value = history.stack[history.idx]
  updateHighlight()
  updatePreview()
}

function historyRedo() {
  if (history.idx >= history.stack.length - 1) return
  history.idx++
  history.ignoreNext = true
  editor.value = history.stack[history.idx]
  updateHighlight()
  updatePreview()
}

// Inicialitzar amb valor buit
historyPush(editor.value)

editor.addEventListener("input", () => {
  if (history.ignoreNext) {
    history.ignoreNext = false
    return
  }
  historyPush(editor.value)
  updateHighlight()
  updatePreview()
  saveDraft()
})

/* ── Ressaltat sintàctic ───────────────────────────────────── */
function escHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
function syntaxHighlight(raw) {
  return escHTML(raw)
    .replace(
      /&lt;sec&gt;(.*?)&lt;\/sec&gt;/g,
      '<span class="hl-tag">&lt;sec&gt;</span><span class="hl-sec">$1</span><span class="hl-tag">&lt;/sec&gt;</span>',
    )
    .replace(
      /&lt;ch&gt;(.*?)&lt;\/ch&gt;/g,
      '<span class="hl-tag">&lt;ch&gt;</span><span class="hl-ch">$1</span><span class="hl-tag">&lt;/ch&gt;</span>',
    )
}
function updateHighlight() {
  highlight.innerHTML = syntaxHighlight(editor.value) + "\n"
  syncScroll()
}
function syncScroll() {
  highlight.scrollTop = editor.scrollTop
}
editor.addEventListener("scroll", syncScroll)

/* ── Vista prèvia ──────────────────────────────────────────── */
function updatePreview() {
  if (!preview.hidden) previewBody.innerHTML = editor.value
}
document.getElementById("toggle-preview").addEventListener("change", (e) => {
  preview.hidden = !e.target.checked
  updatePreview()
})

/* ── Paleta i menú d'acords ────────────────────────────────── */
function buildChordUI() {
  const key = selKey.value
  const { diatonic, secondary } = chordsForKey(key)

  palette.innerHTML = ""
  ;[...diatonic, ...secondary].forEach((ch) => {
    const chip = document.createElement("button")
    chip.className = "chip"
    chip.textContent = ch
    chip.addEventListener("click", () => insertAtCursor(`<ch>${ch}</ch>`))
    palette.appendChild(chip)
  })

  // Menú contextual: primer secció, separador, acords
  menuGroups.innerHTML = ""

  // Acció inserir secció
  const secBtn = document.createElement("button")
  secBtn.className = "chord-menu-action"
  secBtn.innerHTML = "§ Inserir secció"
  secBtn.addEventListener("mousedown", (e) => {
    e.preventDefault()
    hideChordMenu()
    insertSection()
  })
  menuGroups.appendChild(secBtn)

  const sep = document.createElement("hr")
  sep.className = "chord-menu-sep"
  menuGroups.appendChild(sep)
  ;[
    { label: "Acords diatònics", chords: diatonic },
    { label: "Variacions", chords: secondary },
  ].forEach(({ label, chords }) => {
    if (!chords.length) return
    const lbl = document.createElement("div")
    lbl.className = "chord-group-label"
    lbl.textContent = label
    menuGroups.appendChild(lbl)
    const wrap = document.createElement("div")
    wrap.className = "chord-group-items"
    chords.forEach((ch) => {
      const btn = document.createElement("button")
      btn.textContent = ch
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault()
        hideChordMenu()
        insertAtCursor(`<ch>${ch}</ch>`)
      })
      wrap.appendChild(btn)
    })
    menuGroups.appendChild(wrap)
  })
}

selKey.addEventListener("change", buildChordUI)

/* ── Menú contextual ───────────────────────────────────────── */
editor.addEventListener("contextmenu", (e) => {
  e.preventDefault()
  buildChordUI()
  positionMenu(e.clientX, e.clientY)
  chordMenu.hidden = false
})
document.addEventListener("click", hideChordMenu)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideChordMenu()
})

function hideChordMenu() {
  chordMenu.hidden = true
}
function positionMenu(x, y) {
  chordMenu.hidden = false
  const mw = chordMenu.offsetWidth,
    mh = chordMenu.offsetHeight
  const vw = window.innerWidth,
    vh = window.innerHeight
  chordMenu.style.left = (x + mw > vw ? vw - mw - 8 : x) + "px"
  chordMenu.style.top = (y + mh > vh ? vh - mh - 8 : y) + "px"
}

/* ── Inserir text al cursor ────────────────────────────────── */
function insertAtCursor(text) {
  const start = editor.selectionStart
  const end = editor.selectionEnd
  editor.value = editor.value.slice(0, start) + text + editor.value.slice(end)
  const pos = start + text.length
  editor.setSelectionRange(pos, pos)
  editor.focus()
  historyPush(editor.value)
  updateHighlight()
  updatePreview()
  saveDraft()
}

/* ── Inserir secció (posa marcadors, cursor a dins) ─────────── */
function insertSection() {
  const start = editor.selectionStart
  const end = editor.selectionEnd
  const sel = editor.value.slice(start, end).trim()

  if (sel) {
    // Text seleccionat → convertir-lo en secció
    const repl = `<sec>${sel}</sec>`
    editor.value = editor.value.slice(0, start) + repl + editor.value.slice(end)
    editor.setSelectionRange(start + 5, start + 5 + sel.length)
  } else {
    // Sense selecció → inserir marcadors i posar cursor a dins
    const tag = "<sec></sec>"
    editor.value = editor.value.slice(0, start) + tag + editor.value.slice(end)
    const cursorPos = start + 5 // dins de <sec>|</sec>
    editor.setSelectionRange(cursorPos, cursorPos)
  }
  editor.focus()
  historyPush(editor.value)
  updateHighlight()
  updatePreview()
  saveDraft()
}

/* ── Barra d'eines ─────────────────────────────────────────── */
document.getElementById("editor-toolbar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]")
  if (!btn) return
  const action = btn.dataset.action
  if (action === "sec") {
    insertSection()
  } else if (action === "ch") {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim()
    if (sel) {
      insertAtCursor(`<ch>${sel}</ch>`)
    } else {
      const tag = "<ch></ch>"
      const start = editor.selectionStart
      editor.value = editor.value.slice(0, start) + tag + editor.value.slice(start)
      editor.setSelectionRange(start + 4, start + 4)
      editor.focus()
      historyPush(editor.value)
      updateHighlight()
      updatePreview()
    }
  } else if (action === "undo") {
    historyUndo()
  } else if (action === "redo") {
    historyRedo()
  }
})

/* ── Dreceres de teclat ────────────────────────────────────── */
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault()
    insertAtCursor("  ")
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault()
    historyUndo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
    e.preventDefault()
    historyRedo()
  }
})

/* ── Guardar / Enviar ──────────────────────────────────────── */
document.getElementById("btn-save").addEventListener("click", async () => {
  const title = document.getElementById("meta-title").value.trim()
  const artist = document.getElementById("meta-artist").value.trim()
  const key = selKey.value
  const capo = parseInt(document.getElementById("meta-capo").value) || 0
  const lang = document.getElementById("meta-language").value
  const tags = document.getElementById("meta-tags").value.trim()
  const content = editor.value.trim()

  if (!title || !artist || !content) {
    setStatus("⚠ Títol, artista i contingut són obligatoris.", "err")
    return
  }

  const isAdmin = Auth.isAdmin()

  try {
    let res
    if (isEdit) {
      // Mode edició → PUT
      res = await Auth.apiFetch(`/songs/${editId}`, {
        method: "PUT",
        body: JSON.stringify({ title, artist, key, capo, content, language: lang, tags }),
      })
      if (!res.ok) throw new Error()
      setStatus("✓ Cançó actualitzada!", "ok")
    } else if (isAdmin) {
      // Admin → afegir directament
      res = await Auth.apiFetch("/songs", {
        method: "POST",
        body: JSON.stringify({ title, artist, key, capo, content, language: lang, tags }),
      })
      if (!res.ok) throw new Error()
      clearDraft()
      setStatus("✓ Cançó guardada!", "ok")
    } else {
      // Usuari normal → proposta
      res = await Auth.apiFetch("/proposals", {
        method: "POST",
        body: JSON.stringify({ title, artist, key, capo, content, language: lang, tags }),
      })
      if (!res.ok) throw new Error()
      clearDraft()
      setStatus("✓ Proposta enviada! Un admin la revisarà aviat.", "ok")
    }
  } catch {
    setStatus("✕ Error en guardar.", "err")
  }
})

function setStatus(msg, cls) {
  saveStatus.textContent = msg
  saveStatus.className = cls
  setTimeout(() => {
    saveStatus.textContent = ""
    saveStatus.className = ""
  }, 5000)
}
