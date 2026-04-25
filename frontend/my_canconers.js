const state = { canconers: [], active: null }

;(async () => {
  Auth.captureTokenFromURL()
  const user = await Auth.loadUser()
  if (!user) {
    window.location.href = "/"
    return
  }
  Auth.renderUserWidget("user-widget")
  await Promise.all([loadCanconers(), loadProposals()])
})()

/* ── Cançoners ─────────────────────────────────────────────── */
async function loadCanconers() {
  const res = await Auth.apiFetch("/canconers")
  state.canconers = await res.json()
  renderList()
}

function renderList() {
  const ul = document.getElementById("mc-list")
  const empty = document.getElementById("mc-empty")
  ul.innerHTML = ""

  if (!state.canconers.length) {
    empty.hidden = false
    return
  }
  empty.hidden = true

  state.canconers.forEach((c) => {
    const li = document.createElement("li")
    if (state.active?.id === c.id) li.classList.add("active")
    const date = new Date(c.updated_at).toLocaleDateString("ca-ES")
    li.innerHTML = `
      <div class="mc-title">${c.title}</div>
      <div class="mc-info">${c.song_count} cançon${c.song_count !== 1 ? "s" : ""} · ${date}</div>`
    li.addEventListener("click", () => openCanconer(c.id))
    ul.appendChild(li)
  })
}

async function openCanconer(id) {
  const res = await Auth.apiFetch(`/canconers/${id}`)
  state.active = await res.json()
  renderList()
  renderSongs(state.active.songs)
  renderOptions(state.active)
  document.getElementById("mc-placeholder").hidden = true
  document.getElementById("mc-songs-section").hidden = false
  document.getElementById("mc-options-section").hidden = false
}

function renderSongs(songs) {
  const ul = document.getElementById("mc-songs-list")
  const empty = document.getElementById("mc-songs-empty")
  const title = document.getElementById("mc-songs-title")
  title.textContent = `Cançons (${songs.length})`
  ul.innerHTML = ""
  if (!songs.length) {
    empty.hidden = false
    return
  }
  empty.hidden = true
  songs.forEach((s, i) => {
    const key = Transpose.transposeKey(s.key, s.semitones)
    const li = document.createElement("li")
    li.innerHTML = `
      <span class="mc-pos">${i + 1}</span>
      <span class="mc-stitle">${s.title}</span>
      <span class="mc-artist">${s.artist}</span>
      <span class="mc-key">${key}</span>`
    ul.appendChild(li)
  })
}

function renderOptions(c) {
  document.getElementById("mc-detail-title").textContent = c.title
  const date = new Date(c.updated_at).toLocaleDateString("ca-ES", { dateStyle: "long" })
  document.getElementById("mc-detail-meta").textContent =
    `${c.songs.length} cançons · Actualitzat el ${date}`
  // Reset edició títol
  document.getElementById("mc-title-display").hidden = false
  document.getElementById("mc-title-edit").hidden = true
  renderShareBox(c)
}

function renderShareBox(c) {
  const enabled = document.getElementById("share-enabled")
  const disabled = document.getElementById("share-disabled")
  if (c.share_token) {
    enabled.hidden = false
    disabled.hidden = true
    document.getElementById("share-url").value = `${location.origin}/c/${c.share_token}`
  } else {
    enabled.hidden = true
    disabled.hidden = false
  }
}

/* ── Editar títol ──────────────────────────────────────────── */
document.getElementById("btn-edit-title").addEventListener("click", () => {
  document.getElementById("mc-title-display").hidden = true
  document.getElementById("mc-title-edit").hidden = false
  const input = document.getElementById("mc-title-input")
  input.value = state.active.title
  input.focus()
  input.select()
})

document.getElementById("btn-cancel-title").addEventListener("click", () => {
  document.getElementById("mc-title-display").hidden = false
  document.getElementById("mc-title-edit").hidden = true
})

document.getElementById("btn-save-title").addEventListener("click", async () => {
  const newTitle = document.getElementById("mc-title-input").value.trim()
  if (!newTitle) return
  if (newTitle === state.active.title) {
    document.getElementById("mc-title-display").hidden = false
    document.getElementById("mc-title-edit").hidden = true
    return
  }
  // Comprovar duplicat
  const duplicate = state.canconers.find(
    (c) => c.title.toLowerCase() === newTitle.toLowerCase() && c.id !== state.active.id,
  )
  if (duplicate) {
    showToast("Ja tens un cançoner amb aquest nom.", true)
    return
  }

  const res = await Auth.apiFetch("/canconers", {
    method: "POST",
    body: JSON.stringify({
      id: state.active.id,
      title: newTitle,
      songs: state.active.songs.map((s) => ({ id: s.id, semitones: s.semitones })),
    }),
  })
  if (res.ok) {
    state.active.title = newTitle
    document.getElementById("mc-detail-title").textContent = newTitle
    document.getElementById("mc-title-display").hidden = false
    document.getElementById("mc-title-edit").hidden = true
    await loadCanconers()
    showToast("Nom actualitzat!")
  } else {
    showToast("Error en canviar el nom.", true)
  }
})

/* ── Carregar ──────────────────────────────────────────────── */
document.getElementById("btn-load").addEventListener("click", () => {
  if (!state.active) return
  sessionStorage.setItem("load_canconer", JSON.stringify(state.active))
  window.location.href = "/"
})

/* ── Eliminar ──────────────────────────────────────────────── */
document.getElementById("btn-delete").addEventListener("click", async () => {
  if (!state.active) return
  if (!confirm(`Eliminar "${state.active.title}"? Aquesta acció no es pot desfer.`)) return
  await Auth.apiFetch(`/canconers/${state.active.id}`, { method: "DELETE" })
  state.active = null
  document.getElementById("mc-songs-section").hidden = true
  document.getElementById("mc-options-section").hidden = true
  document.getElementById("mc-placeholder").hidden = false
  await loadCanconers()
})

/* ── Compartir ─────────────────────────────────────────────── */
document.getElementById("btn-enable-share").addEventListener("click", async () => {
  const res = await Auth.apiFetch(`/canconers/${state.active.id}/share`, {
    method: "POST",
    body: JSON.stringify({ action: "enable" }),
  })
  const { share_token } = await res.json()
  state.active.share_token = share_token
  renderShareBox(state.active)
})

document.getElementById("btn-copy").addEventListener("click", () => {
  const url = document.getElementById("share-url").value
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById("btn-copy")
    const orig = btn.textContent
    btn.textContent = "✓ Copiat!"
    setTimeout(() => {
      btn.textContent = orig
    }, 2000)
  })
})

document.getElementById("btn-revoke").addEventListener("click", async () => {
  if (!confirm("Revocar l'enllaç? Qui el tingui ja no podrà accedir al cançoner.")) return
  await Auth.apiFetch(`/canconers/${state.active.id}/share`, {
    method: "POST",
    body: JSON.stringify({ action: "disable" }),
  })
  state.active.share_token = null
  renderShareBox(state.active)
})

/* ── Propostes ─────────────────────────────────────────────── */
async function loadProposals() {
  const res = await Auth.apiFetch("/proposals")
  const data = await res.json()
  const ul = document.getElementById("proposals-list")
  const empty = document.getElementById("proposals-empty")
  const badge = document.getElementById("proposals-badge")
  ul.innerHTML = ""

  const pending = data.filter((p) => p.status === "pending").length
  if (pending) {
    badge.textContent = `${pending} pendent${pending > 1 ? "s" : ""}`
    badge.hidden = false
  }

  if (!data.length) {
    empty.hidden = false
    return
  }
  empty.hidden = true

  const labels = { pending: "Pendent", approved: "Aprovada", rejected: "Rebutjada" }
  data.forEach((p) => {
    const li = document.createElement("li")
    li.innerHTML = `
      <div class="p-info">
        <div class="p-title">${p.song_title}</div>
        <div class="p-artist">${p.song_artist}</div>
        ${p.notes ? `<div class="p-notes">Nota: ${p.notes}</div>` : ""}
      </div>
      <span class="p-status status-${p.status}">${labels[p.status]}</span>`
    ul.appendChild(li)
  })
}

function showToast(msg, isError = false) {
  const t = document.createElement("div")
  t.className = `toast${isError ? " toast-error" : ""}`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}
