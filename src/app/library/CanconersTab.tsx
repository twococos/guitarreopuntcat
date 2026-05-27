"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useToastStore } from "@/hooks/useToasts"
import { transposeKey } from "@/lib/transpose"
import type { CanconerStyle } from "@/types/song"
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconOpen,
  IconPencil,
  IconPlus,
  IconRevoke,
  IconShare,
  IconTrash,
} from "@/components/shared/Icons"

// ─── Tipus locals ──────────────────────────────────────────────

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

interface CanconerDetail extends CanconerListItem {
  songs: CanconerSong[]
}

// ─── Component ────────────────────────────────────────────────

export function CanconersTab() {
  const router = useRouter()

  const [canconers, setCanconers] = useState<CanconerListItem[]>([])
  const [active, setActive] = useState<CanconerDetail | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"updated" | "title" | "song_count">("updated")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // ─── Càrrega de la llista ──────────────────────────────────

  const loadCanconers = useCallback(async () => {
    const res = await fetch("/api/canconers")
    if (!res.ok) return
    const data = (await res.json()) as CanconerListItem[]
    setCanconers(data)
  }, [])

  useEffect(() => {
    loadCanconers()
  }, [loadCanconers])

  // ─── Selecció de cançoner ─────────────────────────────────

  async function selectCanconer(id: number) {
    const res = await fetch(`/api/canconers/${id}`)
    if (!res.ok) return
    const data = (await res.json()) as CanconerDetail
    setActive(data)
    setEditingTitle(false)
    setCopied(false)
  }

  // ─── Filtrat i ordenació (memoitzat) ─────────────────────

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? canconers.filter((c) => c.title.toLowerCase().includes(q))
      : canconers
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === "title") {
        cmp = a.title.localeCompare(b.title, "ca")
      } else if (sortBy === "song_count") {
        cmp = a.song_count - b.song_count
      } else {
        cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? "")
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [canconers, search, sortBy, sortDir])

  // ─── Handlers ─────────────────────────────────────────────

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
      useToastStore.getState().show("Ja tens un cançoner amb aquest nom.", { type: "error" })
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
      useToastStore.getState().show("Error en guardar el nom.", { type: "error" })
      return
    }
    setActive((prev) => (prev ? { ...prev, title: trimmed } : prev))
    setEditingTitle(false)
    await loadCanconers()
    useToastStore.getState().show("Nom actualitzat!")
  }

  function handleEdit() {
    if (!active) return
    sessionStorage.setItem("load_canconer", JSON.stringify(active))
    router.push("/")
  }

  async function handleDelete() {
    if (!active) return
    if (!confirm(`Eliminar "${active.title}"? Aquesta acció no es pot desfer.`)) return
    const res = await fetch(`/api/canconers/${active.id}`, { method: "DELETE" })
    if (!res.ok) {
      useToastStore.getState().show("Error en eliminar el cançoner.", { type: "error" })
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

  // ─── Render ───────────────────────────────────────────────

  return (
    <div id="library-canconers">
      {/* Columna esquerra: cerca + llista de targetes */}
      <section className="library-col library-col-left">
        <div className="library-toolbar">
          <input
            className="library-search"
            type="search"
            placeholder="Cerca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="library-sort">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "updated" | "title" | "song_count")}
            >
              <option value="updated">Data</option>
              <option value="title">Títol</option>
              <option value="song_count">Nombre de cançons</option>
            </select>
            <button
              type="button"
              className="library-sort-dir"
              aria-label={sortDir === "asc" ? "Ascendent" : "Descendent"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        <ul className="library-cards">
          {visible.map((c) => {
            const isActive = active?.id === c.id
            const isEditing = isActive && editingTitle
            return (
              <li key={c.id} className={`library-card ${isActive ? "active" : ""}`}>
                {/* Capçalera de la targeta. Si està en mode edició, el títol
                    es reemplaça per l'input. La capçalera deixa de ser un
                    botó clicable mentre s'edita el nom per a no plegar la
                    targeta sense voler. */}
                {isEditing && active ? (
                  <div className="library-card-header library-card-header-editing">
                    <input
                      className="library-card-title-input"
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle()
                        if (e.key === "Escape") setEditingTitle(false)
                      }}
                    />
                    <button
                      type="button"
                      className="library-card-title-btn"
                      aria-label="Guardar"
                      onClick={saveTitle}
                    >
                      <IconCheck />
                    </button>
                    <button
                      type="button"
                      className="library-card-title-btn"
                      aria-label="Cancel·lar"
                      onClick={() => setEditingTitle(false)}
                    >
                      <IconRevoke />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="library-card-header"
                    onClick={() => (isActive ? setActive(null) : selectCanconer(c.id))}
                  >
                    <div className="library-card-title">
                      <span>{isActive && active ? active.title : c.title}</span>
                      {isActive && active && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="library-card-title-btn"
                          aria-label="Editar nom"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTitleDraft(active.title)
                            setEditingTitle(true)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              e.stopPropagation()
                              setTitleDraft(active.title)
                              setEditingTitle(true)
                            }
                          }}
                        >
                          <IconPencil />
                        </span>
                      )}
                    </div>
                    <div className="library-card-meta">
                      {c.song_count} cançons ·{" "}
                      {new Date(c.updated_at ?? "").toLocaleDateString("ca-ES")}
                    </div>
                  </button>
                )}

                {/* Secció expandible: accions i compartir */}
                <div
                  className="library-card-actions"
                  data-open={isActive ? "true" : "false"}
                >
                  <div className="library-card-actions-inner">
                    {isActive && active && (
                      <>
                        {/* Accions principals en una sola fila */}
                        <div className="library-actions-row">
                          <button
                            type="button"
                            className="library-action"
                            onClick={() =>
                              router.push(`/library/canconers/${active.id}/preview`)
                            }
                          >
                            <IconEye /> Mostrar
                          </button>
                          <button
                            type="button"
                            className="library-action"
                            onClick={handleEdit}
                          >
                            <IconOpen /> Editar
                          </button>
                          <button
                            type="button"
                            className="library-action library-action-danger"
                            onClick={handleDelete}
                          >
                            <IconTrash /> Eliminar
                          </button>
                        </div>

                        {/* Compartir: tot en una fila */}
                        <div className="library-share-row">
                          {active.share_token ? (
                            <>
                              <input
                                type="text"
                                readOnly
                                value={`${typeof window !== "undefined" ? window.location.origin : ""}/c/${active.share_token}`}
                                onClick={(e) =>
                                  (e.target as HTMLInputElement).select()
                                }
                              />
                              <button
                                type="button"
                                className="library-share-btn"
                                aria-label={copied ? "Copiat!" : "Copiar enllaç"}
                                title={copied ? "Copiat!" : "Copiar enllaç"}
                                onClick={handleCopy}
                              >
                                {copied ? <IconCheck /> : <IconCopy />}
                              </button>
                              <button
                                type="button"
                                className="library-share-btn library-share-btn-danger"
                                aria-label="Revocar enllaç"
                                title="Revocar enllaç"
                                onClick={handleRevoke}
                              >
                                <IconRevoke />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="library-action library-action-primary"
                              onClick={handleEnableShare}
                            >
                              <IconShare /> Compartir
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {canconers.length === 0 && (
          <div className="library-empty">
            <p>Encara no has guardat cap cançoner.</p>
            <Link href="/" className="library-empty-btn">
              <IconPlus /> Crear el primer
            </Link>
          </div>
        )}
      </section>

      {/* Columna dreta: cançons del cançoner seleccionat */}
      <section className="library-col library-col-right">
        {active ? (
          <>
            <h2 className="library-songs-header">Cançons ({active.songs.length})</h2>
            <ul className="library-songs-list">
              {active.songs.map((s, i) => (
                <li key={s.id}>
                  <span className="library-song-pos">{i + 1}</span>
                  <span className="library-song-title">{s.title}</span>
                  <span className="library-song-artist">{s.artist}</span>
                  <span className="library-song-key">{transposeKey(s.key, s.semitones)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="library-placeholder">
            <p>Selecciona un cançoner per veure&apos;n les cançons.</p>
          </div>
        )}
      </section>
    </div>
  )
}
