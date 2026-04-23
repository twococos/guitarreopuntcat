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
    if (error === "error") {
      console.error("Error d'autenticació amb Google")
    }
    return false
  }

  /* ── Renderitzar widget d'usuari ─────────────────────────── */
  function renderUserWidget(containerId) {
    const el = document.getElementById(containerId)
    if (!el) return

    if (!_user) {
      el.innerHTML = `<button class="btn-login" onclick="Auth.login()">
        <img src="/img/google.svg" alt="" width="16"> Inicia sessió
      </button>`
      return
    }

    el.innerHTML = `
      <div class="user-widget">
        <img src="${_user.avatar_url}" alt="${_user.name}" class="user-avatar" />
        <span class="user-name">${_user.name.split(" ")[0]}</span>
        ${isAdmin() ? '<span class="badge-admin">admin</span>' : ""}
        <div class="user-menu">
          <a href="/my-canconers.html">Els meus cançoners</a>
          ${isAdmin() ? '<a href="/admin.html">Panell admin</a>' : ""}
          <button onclick="Auth.logout()">Tancar sessió</button>
        </div>
      </div>`
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
    renderUserWidget,
  }
})()
