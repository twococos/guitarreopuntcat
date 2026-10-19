"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useToastStore } from "@/hooks/useToasts"
import { SongView } from "@/components/song/SongView"
import {
  IconEye,
  IconGitBranch,
  IconLock,
  IconPencil,
  IconPlus,
  IconSend,
  IconTrash,
} from "@/components/shared/Icons"
import { getT } from "@/lib/i18n"

// ─── Tipus locals (GET /api/me/songs) ──────────────────────────

interface MySong {
  id: number
  title: string
  artist: string
  key: string
  capo: number
  kind: "private" | "arrangement"
  original: {
    id: number
    title: string
    artist: string
    artist_slug: string | null
    song_slug: string | null
  } | null
  rejection_notes: string | null
  songbook_count: number
  created_at: string | null
  updated_at: string | null
}

interface SongDetail {
  id: number
  title: string
  artist: string
  key: string
  content: string
  capo: number
  album: string | null
  year: number | null
}

type KindFilter = "all" | "private" | "arrangement"
type SortKey = "updated" | "title" | "artist"

// ─── Component ────────────────────────────────────────────────

/** Biblioteca › Les meves cançons: privades i arranjaments de l'usuari. */
export function MySongsTab() {
  const t = getT()
  const tt = t.app.library.mySongsTab
  const router = useRouter()

  const [songs, setSongs] = useState<MySong[]>([])
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState<MySong | null>(null)
  const [activeSong, setActiveSong] = useState<SongDetail | null>(null)
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<KindFilter>("all")
  const [sortBy, setSortBy] = useState<SortKey>("updated")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const load = useCallback(async () => {
    const res = await fetch("/api/me/songs")
    if (res.ok) setSongs((await res.json()) as MySong[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function select(s: MySong) {
    if (active?.id === s.id) {
      setActive(null)
      setActiveSong(null)
      return
    }
    const res = await fetch(`/api/songs/${s.id}`)
    if (!res.ok) return
    setActiveSong((await res.json()) as SongDetail)
    setActive(s)
  }

  function addToSongbook(s: MySong) {
    sessionStorage.setItem("start_with_song", JSON.stringify({ songId: s.id, semitones: 0, append: true }))
    router.push("/app")
  }

  async function handleDelete(s: MySong) {
    if (!confirm(tt.confirmEliminar(s.title, s.songbook_count))) return
    const res = await fetch(`/api/songs/${s.id}`, { method: "DELETE" })
    if (!res.ok) {
      useToastStore.getState().show(tt.toastErrorEliminar, { type: "error" })
      return
    }
    useToastStore.getState().show(tt.toastEliminada)
    if (active?.id === s.id) {
      setActive(null)
      setActiveSong(null)
    }
    await load()
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = songs.filter((s) => {
      if (kind !== "all" && s.kind !== kind) return false
      if (!q) return true
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    })
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === "title") cmp = a.title.localeCompare(b.title, "ca")
      else if (sortBy === "artist") cmp = a.artist.localeCompare(b.artist, "ca")
      else cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? "")
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [songs, search, kind, sortBy, sortDir])

  const counts = useMemo(() => ({
    all: songs.length,
    private: songs.filter((s) => s.kind === "private").length,
    arrangement: songs.filter((s) => s.kind === "arrangement").length,
  }), [songs])

  return (
    <div id="library-my-songs">
      <section className="library-col library-col-left">
        <div className="library-toolbar">
          <input
            className="library-search"
            type="search"
            placeholder={tt.cercaPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="library-sort">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="updated">{tt.colData}</option>
              <option value="title">{tt.colTitol}</option>
              <option value="artist">{tt.colArtista}</option>
            </select>
            <button
              type="button"
              className="library-sort-dir"
              aria-label={sortDir === "asc" ? tt.ascendent : tt.descendent}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="library-chips" role="group">
            {(["all", "private", "arrangement"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`library-chip ${kind === k ? "active" : ""}`}
                onClick={() => setKind(k)}
              >
                {k === "all" ? tt.filtreTotes : k === "private" ? tt.filtrePrivades : tt.filtreArranjaments}
                <span className="library-chip-count">{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <ul className="library-cards">
          {visible.map((s) => {
            const isActive = active?.id === s.id
            return (
              <li key={s.id} className={`library-card ${isActive ? "active" : ""}`}>
                <button type="button" className="library-card-header" onClick={() => void select(s)}>
                  <div className="library-card-title">{s.title}</div>
                  <div className="library-card-meta">
                    {s.artist} · {s.key}
                    {s.rejection_notes !== null && (
                      <span className="library-status status-rejected">{tt.propostaRebutjada}</span>
                    )}
                    <span className={`library-status status-${s.kind}`}>
                      {s.kind === "arrangement" ? tt.tipusArranjament : tt.tipusPrivada}
                    </span>
                  </div>
                </button>

                <div className="library-card-actions" data-open={isActive ? "true" : "false"}>
                  <div className="library-card-actions-inner">
                    {isActive && (
                      <>
                        <div className="library-card-infos">
                          {s.original && (
                            <p className="library-card-info">
                              <IconGitBranch /> {tt.arranjamentDe}{" "}
                              {s.original.artist_slug && s.original.song_slug ? (
                                <Link href={`/songs/${s.original.artist_slug}/${s.original.song_slug}`}>
                                  {s.original.title}
                                </Link>
                              ) : (
                                s.original.title
                              )}{" "}
                              ({s.original.artist})
                            </p>
                          )}
                          <p className="library-card-info library-card-info--muted">
                            <IconLock /> {tt.soloTu}
                            {s.songbook_count > 0 && <> · {tt.aCanconers(s.songbook_count)}</>}
                          </p>
                        </div>
                        <div className="library-actions-row">
                          <Link href={`/songs/private/${s.id}`} className="library-action">
                            <IconEye /> {tt.obrir}
                          </Link>
                          <Link href={`/app/editor?id=${s.id}`} className="library-action">
                            <IconPencil /> {tt.editar}
                          </Link>
                          <button
                            type="button"
                            className="library-action library-action-danger"
                            onClick={() => void handleDelete(s)}
                          >
                            <IconTrash /> {tt.eliminar}
                          </button>
                        </div>
                        <div className="library-actions-row">
                          <button type="button" className="library-action" onClick={() => addToSongbook(s)}>
                            <IconPlus /> {tt.afegirCanconer}
                          </button>
                          {s.kind === "private" && (
                            <Link
                              href={`/app/editor?id=${s.id}`}
                              className="library-action"
                              title={tt.proposarHint}
                            >
                              <IconSend /> {s.rejection_notes !== null ? tt.tornarAProposar : tt.proposar}
                            </Link>
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

        {loaded && songs.length === 0 && (
          <div className="library-empty">
            <p>{tt.buit}</p>
            <Link href="/app/editor" className="library-empty-btn">
              <IconPlus /> {tt.novaCanco}
            </Link>
          </div>
        )}
      </section>

      <section className="library-col library-col-right">
        {active && activeSong ? (
          <>
            {active.rejection_notes && (
              <div className="library-feedback-box">
                <strong>{tt.retroaccioAdmin}</strong>
                <p>{active.rejection_notes}</p>
              </div>
            )}
            <SongView song={activeSong} semitones={0} />
          </>
        ) : (
          <div className="library-placeholder">
            <p>{tt.seleccionaCanco}</p>
          </div>
        )}
      </section>
    </div>
  )
}
