/* ── Init ──────────────────────────────────────────────────── */
;(async () => {
  Auth.captureTokenFromURL()
  const user = await Auth.loadUser()
  if (!user || !Auth.isAdmin()) {
    window.location.href = "/"
    return
  }
  Auth.renderUserWidget("user-widget")
  document.getElementById("admin-welcome").textContent = `Benvingut, ${user.name}`
  loadStats()
  loadProposals()
})()

/* ── Pestanyes ─────────────────────────────────────────────── */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"))
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.hidden = true
      p.classList.remove("active")
    })
    tab.classList.add("active")
    const panel = document.getElementById(`tab-${tab.dataset.tab}`)
    panel.hidden = false
    panel.classList.add("active")

    if (tab.dataset.tab === "songs") loadSongs()
    if (tab.dataset.tab === "users") loadUsers()
    if (tab.dataset.tab === "canconers") loadAdminCanconers()
  })
})

/* ── Estadístiques ─────────────────────────────────────────── */
async function loadStats() {
  const res = await Auth.apiFetch("/admin/stats")
  const data = await res.json()
  document.getElementById("sn-songs").textContent = data.songs
  document.getElementById("sn-drafts").textContent = data.drafts
  document.getElementById("sn-users").textContent = data.users
  document.getElementById("sn-canconers").textContent = data.canconers

  if (data.pending > 0) {
    const badge = document.getElementById("pending-badge")
    badge.textContent = data.pending
    badge.hidden = false
  }
}

/* ── Propostes ─────────────────────────────────────────────── */
let allProposals = []

async function loadProposals() {
  const res = await Auth.apiFetch("/proposals")
  allProposals = await res.json()
  renderProposals()
}

document.getElementById("proposal-filter").addEventListener("change", renderProposals)

function renderProposals() {
  const filter = document.getElementById("proposal-filter").value
  const data = filter ? allProposals.filter((p) => p.status === filter) : allProposals
  const ul = document.getElementById("proposals-list")
  const empty = document.getElementById("proposals-empty")
  ul.innerHTML = ""

  if (!data.length) {
    empty.hidden = false
    return
  }
  empty.hidden = true

  const labels = { pending: "Pendent", approved: "Aprovada", rejected: "Rebutjada" }

  data.forEach((p) => {
    const li = document.createElement("li")
    li.innerHTML = `
      <img src="${p.proposer_avatar || ""}" class="user-row-avatar" alt="" />
      <div class="prop-info">
        <div class="prop-title">${p.song_title}
          <span style="font-weight:400;color:var(--muted);font-size:.82rem"> per ${p.song_artist}</span>
        </div>
        <div class="prop-meta">Proposat per ${p.proposer_name} · ${new Date(p.created_at).toLocaleDateString("ca-ES")}</div>
        ${p.notes ? `<div class="prop-notes">Nota admin: ${p.notes}</div>` : ""}
      </div>
      <span class="badge ${p.status === "pending" ? "badge-draft" : p.status === "approved" ? "badge-public" : "badge-inactive"}">
        ${labels[p.status]}
      </span>
      ${p.status === "pending" ? `<button class="btn-xs">Revisar</button>` : ""}`

    li.querySelector(".btn-xs")?.addEventListener("click", () => openReview(p))
    ul.appendChild(li)
  })
}

/* ── Modal de revisió ──────────────────────────────────────── */
let reviewingProposal = null

async function openReview(proposal) {
  reviewingProposal = proposal

  // Carregar contingut complet de la cançó
  const res = await Auth.apiFetch(`/songs/${proposal.song_id}`)
  const song = await res.json()

  document.getElementById("review-title").textContent = `${song.title} — ${song.artist}`
  document.getElementById("review-meta").textContent =
    `To: ${song.key}${song.capo ? ` · Cejilla ${song.capo}` : ""} · Proposat per ${proposal.proposer_name}`
  document.getElementById("review-content").innerHTML = song.content // els tags <ch> i <sec> es renderitzen via song.css
  document.getElementById("review-notes").value = ""
  document.getElementById("review-modal").hidden = false
}

document.getElementById("review-close").addEventListener("click", () => {
  document.getElementById("review-modal").hidden = true
  reviewingProposal = null
})

// Tancar en clicar el fons
document.getElementById("review-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("review-modal")) {
    document.getElementById("review-modal").hidden = true
    reviewingProposal = null
  }
})

async function submitReview(status) {
  if (!reviewingProposal) return
  const notes = document.getElementById("review-notes").value.trim()

  const res = await Auth.apiFetch(`/proposals/${reviewingProposal.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  })

  if (!res.ok) {
    alert("Error en processar la proposta.")
    return
  }

  document.getElementById("review-modal").hidden = true
  reviewingProposal = null
  await Promise.all([loadProposals(), loadStats()])
}

document.getElementById("btn-approve").addEventListener("click", () => submitReview("approved"))
document.getElementById("btn-reject").addEventListener("click", () => submitReview("rejected"))

/* ── Cançons ───────────────────────────────────────────────── */
let allSongs = []

async function loadSongs() {
  const res = await Auth.apiFetch("/songs?sortBy=title")
  allSongs = await res.json()
  renderSongs(allSongs)
}

let songsTimer
document.getElementById("songs-search").addEventListener("input", (e) => {
  clearTimeout(songsTimer)
  songsTimer = setTimeout(() => {
    const q = e.target.value.toLowerCase()
    renderSongs(
      allSongs.filter(
        (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q),
      ),
    )
  }, 250)
})

function renderSongs(songs) {
  const tbody = document.getElementById("songs-tbody")
  tbody.innerHTML = ""
  if (!songs.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">Cap cançó trobada</td></tr>'
    return
  }
  songs.forEach((s) => {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td><strong>${s.title}</strong></td>
      <td>${s.artist}</td>
      <td style="font-family:monospace">${s.key}</td>
      <td><span class="badge ${s.draft ? "badge-draft" : "badge-public"}">${s.draft ? "Esborrany" : "Pública"}</span></td>
      <td class="td-actions">
        <a href="/editor.html?id=${s.id}" class="btn-xs">Editar</a>
        <button class="btn-xs danger">Eliminar</button>
      </td>`
    tr.querySelector(".btn-xs.danger").addEventListener("click", () => deleteSong(s.id, s.title))
    tbody.appendChild(tr)
  })
}

async function deleteSong(id, title) {
  if (!confirm(`Eliminar "${title}"? Aquesta acció no es pot desfer.`)) return
  await Auth.apiFetch(`/songs/${id}`, { method: "DELETE" })
  await loadSongs()
}

/* ── Usuaris ───────────────────────────────────────────────── */
async function loadUsers() {
  const res = await Auth.apiFetch("/admin/users")
  const users = await res.json()
  const tbody = document.getElementById("users-tbody")
  const me = Auth.getUser()
  tbody.innerHTML = ""

  users.forEach((u) => {
    const isMe = u.id === me.id
    const date = new Date(u.created_at).toLocaleDateString("ca-ES")
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>
        <img src="${u.avatar_url || ""}" class="user-row-avatar" alt="" />
        ${u.name} ${isMe ? '<span style="color:var(--muted);font-size:.72rem">(tu)</span>' : ""}
      </td>
      <td style="font-size:.8rem;color:var(--muted)">${u.email}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td style="text-align:center">${u.canconer_count}</td>
      <td style="font-size:.75rem;color:var(--muted)">${date}</td>
      <td class="td-actions">
        ${
          !isMe
            ? `
          <button class="btn-xs ${u.role !== "admin" ? "success" : ""}" data-role="${u.id}">
            ${u.role === "admin" ? "Fer usuari" : "Fer admin"}
          </button>
          <button class="btn-xs ${u.active ? "danger" : ""}" data-active="${u.id}">
            ${u.active ? "Desactivar" : "Activar"}
          </button>`
            : "—"
        }
      </td>`

    tr.querySelector("[data-role]")?.addEventListener("click", async () => {
      const newRole = u.role === "admin" ? "user" : "admin"
      if (!confirm(`Canviar rol de ${u.name} a "${newRole}"?`)) return
      await Auth.apiFetch(`/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      })
      loadUsers()
    })
    tr.querySelector("[data-active]")?.addEventListener("click", async () => {
      const action = u.active ? "desactivar" : "activar"
      if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${u.name}?`)) return
      await Auth.apiFetch(`/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !u.active }),
      })
      loadUsers()
    })
    tbody.appendChild(tr)
  })
}

/* ── Cançoners ─────────────────────────────────────────────── */
let allAdminCanconers = []

async function loadAdminCanconers() {
  const res = await Auth.apiFetch("/admin/canconers")
  allAdminCanconers = await res.json()
  renderAdminCanconers(allAdminCanconers)
}

let canconersTimer
document.getElementById("canconers-search").addEventListener("input", (e) => {
  clearTimeout(canconersTimer)
  canconersTimer = setTimeout(() => {
    const q = e.target.value.toLowerCase()
    renderAdminCanconers(
      allAdminCanconers.filter(
        (c) => c.title.toLowerCase().includes(q) || c.owner_name.toLowerCase().includes(q),
      ),
    )
  }, 250)
})

function renderAdminCanconers(canconers) {
  const tbody = document.getElementById("canconers-tbody")
  tbody.innerHTML = ""
  if (!canconers.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem">Cap cançoner trobat</td></tr>'
    return
  }
  canconers.forEach((c) => {
    const date = new Date(c.updated_at).toLocaleDateString("ca-ES")
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td><strong>${c.title}</strong></td>
      <td style="font-size:.82rem">${c.owner_name}</td>
      <td style="text-align:center">${c.song_count}</td>
      <td style="text-align:center">
        ${
          c.share_token
            ? `<a href="/c/${c.share_token}" target="_blank" class="btn-xs success">🔗 Veure</a>`
            : '<span style="color:var(--muted);font-size:.78rem">No</span>'
        }
      </td>
      <td style="font-size:.78rem;color:var(--muted)">${date}</td>
      <td class="td-actions">
        <button class="btn-xs danger">Eliminar</button>
      </td>`
    tr.querySelector(".btn-xs.danger").addEventListener("click", async () => {
      if (!confirm(`Eliminar el cançoner "${c.title}" de ${c.owner_name}?`)) return
      await Auth.apiFetch(`/admin/canconers/${c.id}`, { method: "DELETE" })
      loadAdminCanconers()
    })
    tbody.appendChild(tr)
  })
}
