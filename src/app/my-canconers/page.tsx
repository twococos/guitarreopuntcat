"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { useToastStore } from "@/hooks/useToasts"
import { transposeKey } from "@/lib/transpose"
import type { CanconerStyle } from "@/types/song"

// ─── Types ────────────────────────────────────────────────────

interface CanconerListItem {
  id: number
  user_id: number
  title: string
  style: CanconerStyle
  accent_color: string | null
  share_token: string | null
  created_at: string | null
  updated_at: string | null
  song_count: number
}

interface CanconerSong {
  id: number
  title: string
  artist: string
  key: string
  capo: number
  semitones: number
  position: number | null
}

interface CanconerDetail {
  id: number
  user_id: number
  title: string
  style: CanconerStyle
  accent_color: string | null
  share_token: string | null
  created_at: string | null
  updated_at: string | null
  songs: CanconerSong[]
}

interface Proposal {
  id: number
  song_id: number
  song_title: string
  song_artist: string
  status: "pending" | "approved" | "rejected"
  notes: string | null
  created_at: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendent",
  approved: "Aprovada",
  rejected: "Rebutjada",
}

// ─── Page ─────────────────────────────────────────────────────

export default function MyCançonersPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const toast = useToastStore()

  const [canconers, setCanconers] = useState<CanconerListItem[]>([])
  const [active, setActive] = useState<CanconerDetail | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [copied, setCopied] = useState(false)

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  const loadCanconers = useCallback(async () => {
    const res = await fetch("/api/canconers")
    if (!res.ok) return
    const data = (await res.json()) as CanconerListItem[]
    setCanconers(data)
  }, [])

  const loadProposals = useCallback(async () => {
    const res = await fetch("/api/proposals")
    if (!res.ok) return
    const data = (await res.json()) as Proposal[]
    setProposals(data)
  }, [])

  useEffect(() => {
    if (status !== "authenticated") return
    loadCanconers()
    loadProposals()
  }, [status, loadCanconers, loadProposals])

  async function selectCanconer(id: number) {
    const res = await fetch(`/api/canconers/${id}`)
    if (!res.ok) return
    const data = (await res.json()) as CanconerDetail
    setActive(data)
    setEditingTitle(false)
    setCopied(false)
  }

  async function saveTitle() {
    if (!active) return
    const trimmed = titleDraft.trim()
    if (!trimmed) return
    if (trimmed === active.title) {
      setEditingTitle(false)
      return
    }
    const dup = canconers.find(
      (c) => c.id !== active.id && c.title.toLowerCase() === trimmed.toLowerCase(),
    )
    if (dup) {
      toast.show("Ja tens un cançoner amb aquest nom.", { type: "error" })
      return
    }
    const res = await fetch("/api/canconers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: active.id,
        title: trimmed,
        style: active.style,
        accent_color: active.accent_color,
        songs: active.songs.map((s) => ({ id: s.id, semitones: s.semitones })),
      }),
    })
    if (!res.ok) {
      toast.show("Error en guardar el nom.", { type: "error" })
      return
    }
    setActive((prev) => (prev ? { ...prev, title: trimmed } : prev))
    setEditingTitle(false)
    await loadCanconers()
    toast.show("Nom actualitzat!")
  }

  function handleLoad() {
    if (!active) return
    sessionStorage.setItem("load_canconer", JSON.stringify(active))
    router.push("/")
  }

  async function handleDelete() {
    if (!active) return
    if (!confirm(`Eliminar "${active.title}"? Aquesta acció no es pot desfer.`)) return
    const res = await fetch(`/api/canconers/${active.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.show("Error en eliminar el cançoner.", { type: "error" })
      return
    }
    setActive(null)
    await loadCanconers()
  }

  async function handleEnableShare() {
    if (!active) return
    const res = await fetch(`/api/canconers/${active.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable" }),
    })
    if (!res.ok) return
    const data = (await res.json()) as { share_token: string | null }
    setActive((prev) => (prev ? { ...prev, share_token: data.share_token } : prev))
  }

  async function handleRevoke() {
    if (!active) return
    if (!confirm("Revocar l'enllaç? Qui el tingui ja no podrà accedir al cançoner.")) return
    const res = await fetch(`/api/canconers/${active.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable" }),
    })
    if (!res.ok) return
    setActive((prev) => (prev ? { ...prev, share_token: null } : prev))
    setCopied(false)
  }

  async function handleCopy() {
    if (!active?.share_token) return
    const url = `${window.location.origin}/c/${active.share_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendingCount = proposals.filter((p) => p.status === "pending").length

  if (status === "loading") {
    return <div style={{ padding: "2rem" }}>Carregant…</div>
  }
  if (status === "unauthenticated") {
    return null
  }

  return (
    <>
      <header>
        <Link href="/" className="back-link">
          ← Cançoner
        </Link>
        <h1>📚 Els meus cançoners</h1>
        <div className="header-actions">
          <Link href="/" className="btn-new-song">
            + Nou cançoner
          </Link>
          <UserWidget />
        </div>
      </header>

      <main id="mc-main">
        {/* Col 1: llista */}
        <section id="mc-list-section">
          <h2 className="mc-section-title">Guardats</h2>
          {canconers.length > 0 ? (
            <ul id="mc-list">
              {canconers.map((c) => (
                <li
                  key={c.id}
                  className={active?.id === c.id ? "active" : ""}
                  onClick={() => selectCanconer(c.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="mc-list-title">{c.title}</div>
                  <div className="mc-list-meta">
                    {c.song_count} cançons ·{" "}
                    {new Date(c.updated_at ?? "").toLocaleDateString("ca-ES")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div id="mc-empty" className="empty-state">
              <span>📭</span>
              <p>Encara no has guardat cap cançoner.</p>
              <Link href="/" className="btn-primary btn-sm">
                Crear el primer
              </Link>
            </div>
          )}
        </section>

        {/* Col 2: cançons del seleccionat */}
        {active && (
          <section id="mc-songs-section">
            <div className="mc-songs-header">
              <h2 id="mc-songs-title" className="mc-section-title">
                Cançons ({active.songs.length})
              </h2>
            </div>
            <ul id="mc-songs-list">
              {active.songs.map((s, i) => (
                <li key={s.id}>
                  <span className="mc-pos">{i + 1}</span>
                  <span className="mc-stitle">{s.title}</span>
                  <span className="mc-artist">{s.artist}</span>
                  <span className="mc-key">{transposeKey(s.key, s.semitones)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Col 3: opcions */}
        {active && (
          <section id="mc-options-section">
            {!editingTitle ? (
              <div id="mc-title-display">
                <h2 id="mc-detail-title">{active.title}</h2>
                <button
                  id="btn-edit-title"
                  className="btn-icon"
                  title="Editar nom"
                  onClick={() => {
                    setTitleDraft(active.title)
                    setEditingTitle(true)
                  }}
                >
                  ✏️
                </button>
              </div>
            ) : (
              <div id="mc-title-edit">
                <input
                  type="text"
                  id="mc-title-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoFocus
                />
                <button id="btn-save-title" className="btn-outline-sm" onClick={saveTitle}>
                  Guardar
                </button>
                <button
                  id="btn-cancel-title"
                  className="btn-ghost-sm"
                  onClick={() => setEditingTitle(false)}
                >
                  Cancel·lar
                </button>
              </div>
            )}

            <p id="mc-detail-meta">
              {active.songs.length} cançons · Actualitzat el{" "}
              {new Date(active.updated_at ?? "").toLocaleDateString("ca-ES", {
                dateStyle: "long",
              })}
            </p>

            <div className="mc-options-group">
              <h3 className="mc-options-label">Accions</h3>
              <button id="btn-load" className="btn-option" onClick={handleLoad}>
                📂 Carregar al cançoner
              </button>
              <button
                id="btn-delete"
                className="btn-option btn-option-danger"
                onClick={handleDelete}
              >
                🗑 Eliminar cançoner
              </button>
            </div>

            <div className="mc-options-group">
              <h3 className="mc-options-label">Compartir</h3>
              {active.share_token ? (
                <div id="share-enabled">
                  <div className="share-row">
                    <input
                      id="share-url"
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/c/${active.share_token}`}
                    />
                  </div>
                  <div className="share-actions">
                    <button id="btn-copy" className="btn-outline-sm" onClick={handleCopy}>
                      {copied ? "✓ Copiat!" : "📋 Copiar enllaç"}
                    </button>
                    <button
                      id="btn-revoke"
                      className="btn-option btn-option-danger btn-sm-opt"
                      onClick={handleRevoke}
                    >
                      🚫 Revocar
                    </button>
                  </div>
                  <small>Qualsevol persona amb l&apos;enllaç pot veure i descarregar el cançoner.</small>
                </div>
              ) : (
                <div id="share-disabled">
                  <button
                    id="btn-enable-share"
                    className="btn-option"
                    onClick={handleEnableShare}
                  >
                    🔗 Generar enllaç de compartició
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Placeholder si no hi ha active */}
        {!active && (
          <div id="mc-placeholder" className="mc-placeholder empty-state">
            <span>👈</span>
            <p>Selecciona un cançoner per veure&apos;l</p>
          </div>
        )}
      </main>

      {/* Propostes */}
      <div id="proposals-section">
        <div className="proposals-header">
          <h2>
            Les meves propostes{" "}
            {pendingCount > 0 && (
              <span id="proposals-badge">
                {pendingCount} pendent{pendingCount > 1 ? "s" : ""}
              </span>
            )}
          </h2>
        </div>
        {proposals.length > 0 ? (
          <ul id="proposals-list">
            {proposals.map((p) => (
              <li key={p.id}>
                <div className="p-info">
                  <div className="p-title">{p.song_title}</div>
                  <div className="p-artist">{p.song_artist}</div>
                  {p.notes && <div className="p-notes">Nota: {p.notes}</div>}
                </div>
                <span className={`p-status status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div id="proposals-empty" className="empty-state-sm">
            <p>No has fet cap proposta de cançó encara.</p>
          </div>
        )}
      </div>

      <ToastHost />
    </>
  )
}
