/**
 * auth.js — Gestió d'autenticació al frontend
 * Inclou a totes les pàgines abans dels altres scripts.
 */

const Auth = (() => {
  const TOKEN_KEY = "canconer_token"

  /* ── Token ───────────────────────────────────────────────── */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY)
  }
  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, t)
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  }

  /** Capçalera Authorization per a fetch. */
  function headers(extra = {}) {
    const t = getToken()
    return t ? { Authorization: `Bearer ${t}`, ...extra } : extra
  }

  /** Fetch autenticat. */
  function apiFetch(path, opts = {}) {
    return fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", ...headers(), ...(opts.headers || {}) },
    })
  }

  /* ── Sessió ──────────────────────────────────────────────── */
  let _user = null

  async function loadUser() {
    if (!getToken()) return null
    try {
      const res = await apiFetch("/auth/me")
      const { user } = await res.json()
      _user = user
      return user
    } catch {
      _user = null
      return null
    }
  }

  function getUser() {
    return _user
  }
  function isAdmin() {
    return _user?.role === "admin"
  }
  function isLoggedIn() {
    return !!_user
  }

  function login() {
    window.location.href = "/api/auth/google"
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" })
    clearToken()
    _user = null
    window.location.href = "/"
  }

  /* ── Captura del token a la URL (callback de Google) ─────── */
  function captureTokenFromURL() {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("token")
    const error = params.get("auth")

    if (token) {
      setToken(token)
      // Netejar la URL sense recarregar
      window.history.replaceState({}, "", window.location.pathname)
      return true
    }
    if (error === "error") console.error("Error d'autenticació amb Google")
    return false
  }

  /* ── Popup d'inici de sessió ─────────────────────────────── */
  function createLoginPopup() {
    // Evitar duplicats
    document.getElementById("auth-popup-overlay")?.remove()

    const overlay = document.createElement("div")
    overlay.id = "auth-popup-overlay"
    overlay.innerHTML = `
      <div id="auth-popup">
        <button id="auth-popup-close" aria-label="Tancar">✕</button>
        <div id="auth-popup-logo">🎵</div>
        <h2>Benvingut al Cançoner</h2>
        <p>Inicia sessió per guardar els teus cançoners i molt més.</p>
        <div id="auth-popup-methods">
          <button id="btn-google-login">
            <img src="/img/google.svg" alt="" />
            Continua amb Google
          </button>
        </div>
        <p class="auth-popup-note">En iniciar sessió acceptes els termes d'ús.</p>
      </div>`

    // Tancar en clicar el fons
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove()
    })
    overlay.querySelector("#auth-popup-close").addEventListener("click", () => overlay.remove())
    overlay.querySelector("#btn-google-login").addEventListener("click", login)

    document.body.appendChild(overlay)
  }

  /* ── Widget d'usuari ─────────────────────────────────────── */
  function renderUserWidget(containerId) {
    const el = document.getElementById(containerId)
    if (!el) return
    el.innerHTML = ""

    if (!_user) {
      /* ── Botó "Inicia sessió" ── */
      const btn = document.createElement("button")
      btn.className = "btn-login"
      btn.innerHTML = `<img src="/img/google.svg" alt="" />Inicia sessió`
      btn.addEventListener("click", createLoginPopup)
      el.appendChild(btn)
      return
    }

    /* ── Widget d'usuari autenticat ── */
    const wrap = document.createElement("div")
    wrap.className = "user-widget"

    // Trigger
    const trigger = document.createElement("button")
    trigger.className = "user-trigger"
    trigger.innerHTML = `
      <img src="${_user.avatar_url}" class="user-avatar" alt="${_user.name}" />
      <span class="user-name">${_user.name.split(" ")[0]}</span>
      ${isAdmin() ? '<span class="badge-admin">admin</span>' : ""}
      <span class="user-chevron">▾</span>`

    // Dropdown
    const dropdown = document.createElement("div")
    dropdown.className = "user-dropdown"
    dropdown.hidden = true
    dropdown.innerHTML = `
      <div class="user-dropdown-header">
        <img src="${_user.avatar_url}" class="user-avatar-lg" alt="" />
        <div>
          <div class="user-dropdown-name">${_user.name}</div>
          <div class="user-dropdown-email">${_user.email}</div>
        </div>
      </div>
      <div class="user-dropdown-sep"></div>
      <a href="/my_canconers.html" class="user-dropdown-item">📚 Els meus cançoners</a>
      ${isAdmin() ? `<a href="/admin.html" class="user-dropdown-item">⚙️ Panell d'administració</a>` : ""}
      <div class="user-dropdown-sep"></div>
      <button class="user-dropdown-item user-dropdown-logout" id="btn-do-logout">Tancar sessió</button>`

    // Obrir/tancar dropdown en clicar el trigger
    trigger.addEventListener("click", (e) => {
      e.stopPropagation()
      dropdown.hidden = !dropdown.hidden
    })

    // Tancar en clicar fora
    document.addEventListener("click", () => {
      dropdown.hidden = true
    })

    // Evitar que clicar dins el dropdown el tanqui
    dropdown.addEventListener("click", (e) => e.stopPropagation())

    // Logout
    dropdown.querySelector("#btn-do-logout").addEventListener("click", logout)

    wrap.appendChild(trigger)
    wrap.appendChild(dropdown)
    el.appendChild(wrap)
  }

  return {
    getToken,
    setToken,
    clearToken,
    headers,
    apiFetch,
    loadUser,
    getUser,
    isAdmin,
    isLoggedIn,
    login,
    logout,
    captureTokenFromURL,
    createLoginPopup,
    renderUserWidget,
  }
})()
