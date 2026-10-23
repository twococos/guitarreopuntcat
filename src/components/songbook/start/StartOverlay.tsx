"use client"
import { useEffect, useMemo, useState } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useUiStore } from "@/hooks/useUi"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"
import { IconBookOpen, IconChevronLeft, IconGlobe, IconPlus, IconSearch } from "@/components/shared/Icons"
import { PublicSongbookSearch } from "./PublicSongbookSearch"
import type { CanconerSongRef, CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"

/** Cançoner a carregar a l'editor (forma de `load_canconer`). Sense `id`,
 *  és una còpia que es desarà com a cançoner nou. */
export interface LoadCanconerPayload {
  id?: number
  title: string
  style?: CanconerStyle
  accent_color?: string | null
  pdf_options?: PdfOptions | null
  songs: CanconerSongRef[]
}

/** Resposta de GET /api/songbooks/[id]. */
interface PublicSongbookCopy extends Omit<LoadCanconerPayload, "id" | "songs"> {
  songs: Array<CanconerSongRef & { state: number }>
}

interface OwnSongbook {
  id: number
  title: string
  visibility: number
  updated_at: string | null
  song_count: number
}

type View = "choose" | "create" | "open" | "public"

interface Props {
  onLoad: (data: LoadCanconerPayload) => Promise<void>
}

/**
 * Overlay d'inici de /app: amb sessió i sense cap cançoner en curs, l'editor
 * queda difuminat fins que l'usuari n'obre un (seu o còpia d'un de públic)
 * o en crea un de nou amb títol.
 */
export function StartOverlay({ onLoad }: Props) {
  const t = getT()
  const ts = t.app.songbook.startOverlay
  const setStartOverlay = useUiStore((s) => s.setStartOverlay)
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)

  const [view, setView] = useState<View>("choose")
  const [own, setOwn] = useState<OwnSongbook[] | null>(null)
  const [busy, setBusy] = useState(false)

  // La llista serveix per a «Obre» i per detectar títols duplicats a «Crea»
  useEffect(() => {
    let cancelled = false
    void fetch("/api/canconers")
      .then((r) => (r.ok ? (r.json() as Promise<OwnSongbook[]>) : []))
      .then((list) => {
        if (!cancelled) setOwn(list)
      })
      .catch(() => {
        if (!cancelled) setOwn([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Esc torna a la tria (a la tria no fa res: cal escollir)
  useEffect(() => {
    if (view === "choose") return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setView("choose")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [view])

  async function load(fetchPayload: () => Promise<LoadCanconerPayload | null>) {
    if (busy) return
    setBusy(true)
    try {
      const data = await fetchPayload()
      if (!data) throw new Error("no trobat")
      await onLoad(data)
      setStartOverlay(false)
    } catch {
      useToastStore.getState().show(ts.errorCarregant, { type: "error" })
    } finally {
      setBusy(false)
    }
  }

  function openOwn(id: number) {
    void load(async () => {
      const res = await fetch(`/api/canconers/${id}`)
      return res.ok ? ((await res.json()) as LoadCanconerPayload) : null
    })
  }

  function create(title: string) {
    setCanconerTitle(title)
    setStartOverlay(false)
  }

  return (
    <div className="start-overlay" role="dialog" aria-modal="true" aria-label={ts.titol}>
      <div className={`start-overlay-card start-overlay-card--${view}`}>
        {view !== "choose" && (
          <button type="button" className="start-overlay-back" onClick={() => setView("choose")}>
            <IconChevronLeft /> {ts.enrere}
          </button>
        )}

        {view === "choose" && (
          <>
            <h2 className="start-overlay-title">{ts.titol}</h2>
            <div className="start-overlay-choices">
              <button type="button" className="start-overlay-choice" onClick={() => setView("open")}>
                <span className="start-overlay-choice-icon"><IconBookOpen /></span>
                <span className="start-overlay-choice-label">{ts.obrir}</span>
                <span className="start-overlay-choice-hint">{ts.obrirHint}</span>
              </button>
              <button type="button" className="start-overlay-choice" onClick={() => setView("create")}>
                <span className="start-overlay-choice-icon"><IconPlus /></span>
                <span className="start-overlay-choice-label">{ts.crear}</span>
                <span className="start-overlay-choice-hint">{ts.crearHint}</span>
              </button>
            </div>
          </>
        )}

        {view === "create" && <CreateView own={own} onCreate={create} />}

        {view === "open" && (
          <OpenView
            own={own}
            busy={busy}
            onOpen={openOwn}
            onCreate={() => setView("create")}
            onPublic={() => setView("public")}
          />
        )}

        {view === "public" && (
          <PublicSongbookSearch
            busy={busy}
            onCopy={(id) =>
              void load(async () => {
                const res = await fetch(`/api/songbooks/${id}`)
                if (!res.ok) return null
                const data = (await res.json()) as PublicSongbookCopy
                if (data.songs.some((s) => s.state !== 0)) {
                  useToastStore.getState().show(t.public.songbookViewer.copiaSensePrivades)
                }
                return data
              })
            }
          />
        )}
      </div>
    </div>
  )
}

/* ── Crea: demana el títol ─────────────────────────────────── */

function CreateView({ own, onCreate }: { own: OwnSongbook[] | null; onCreate: (title: string) => void }) {
  const ts = getT().app.songbook.startOverlay
  const [title, setTitle] = useState("")
  const trimmed = title.trim()
  const duplicate =
    trimmed !== "" && (own ?? []).some((c) => c.title.toLowerCase() === trimmed.toLowerCase())
  const canCreate = trimmed !== "" && !duplicate

  return (
    <form
      className="start-overlay-create"
      onSubmit={(e) => {
        e.preventDefault()
        if (canCreate) onCreate(trimmed)
      }}
    >
      <label className="start-overlay-title" htmlFor="start-overlay-title-input">
        {ts.creaTitol}
      </label>
      <input
        id="start-overlay-title-input"
        type="text"
        className="start-overlay-input"
        placeholder={ts.creaPlaceholder}
        value={title}
        maxLength={200}
        autoFocus
        autoComplete="off"
        aria-invalid={duplicate}
        onChange={(e) => setTitle(e.target.value)}
      />
      {duplicate && <p className="start-overlay-error">{ts.titolDuplicat}</p>}
      <button type="submit" className="start-overlay-primary" disabled={!canCreate}>
        {ts.creaBoto}
      </button>
    </form>
  )
}

/* ── Obre: els cançoners de l'usuari ───────────────────────── */

function OpenView({
  own,
  busy,
  onOpen,
  onCreate,
  onPublic,
}: {
  own: OwnSongbook[] | null
  busy: boolean
  onOpen: (id: number) => void
  onCreate: () => void
  onPublic: () => void
}) {
  const t = getT()
  const ts = t.app.songbook.startOverlay
  const [q, setQ] = useState("")

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return [...(own ?? [])]
      .filter((c) => !term || c.title.toLowerCase().includes(term))
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
  }, [own, q])

  return (
    <div className="start-overlay-open">
      <h2 className="start-overlay-title">{ts.elsTeus}</h2>
      {own === null ? (
        <p className="start-overlay-empty">{ts.carregant}</p>
      ) : own.length === 0 ? (
        <div className="start-overlay-empty">
          <p>{ts.cap}</p>
          <button type="button" className="start-overlay-primary" onClick={onCreate}>
            <IconPlus /> {ts.crear}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="start-overlay-input start-overlay-input--small"
            placeholder={ts.cercaTeus}
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="start-overlay-list" aria-busy={busy}>
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="start-overlay-item"
                  disabled={busy}
                  onClick={() => onOpen(c.id)}
                >
                  <span className="start-overlay-item-title">{c.title}</span>
                  <span className="start-overlay-item-meta">
                    {t.app.library.canconersTab.numCancons(c.song_count)}
                    {c.updated_at && <> · {new Date(c.updated_at).toLocaleDateString("ca-ES")}</>}
                    {c.visibility === 1 && (
                      <span className="library-status status-public">
                        <IconGlobe /> {t.app.library.canconersTab.public}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="start-overlay-empty">{ts.capCoincidencia}</li>}
          </ul>
        </>
      )}
      <button type="button" className="start-overlay-secondary" onClick={onPublic}>
        <IconSearch /> {ts.cercaPublics}
      </button>
    </div>
  )
}
