"use client"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { parseChordSourceUrl } from "@/lib/transcriber/chordSourceSites"
import { AdminDialog } from "./AdminDialog"

// GET /api/admin/songs/[id]/chord-sources (src/db/queries/chordSources.ts, listChordSources)
interface ChordSourceRow {
  url: string
  site: string
  manual: boolean
  blocked: boolean
  rating: number | null
  votes: number | null
  fit: number | null
  matched: number | null
  weight: number
  group: number | null
  used: boolean
}

interface SourcesResponse {
  sources: ChordSourceRow[]
  can_update: boolean
  active_job: boolean
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

/** La URL sense protocol ni «www.», per mostrar-la. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}

/**
 * Fonts d'acords d'una cançó: tabs d'internet que el transcriptor contrasta amb l'àudio. Es poden
 * afegir URL a mà, descartar-ne o recuperar-ne, i tornar a analitzar la cançó perquè els canvis
 * tinguin efecte.
 */
export function ChordSourcesDialog({
  songId,
  songTitle,
  onClose,
}: {
  songId: number
  songTitle: string
  onClose: () => void
}) {
  const t = getT()
  const tt = t.admin.songsTab.chordSourcesDialog
  const [data, setData] = useState<SourcesResponse | null>(null)
  const [newUrl, setNewUrl] = useState("")
  const [busy, setBusy] = useState(false)
  // Hi ha canvis que cap anàlisi encuada no ha recollit encara
  const [dirty, setDirty] = useState(false)
  const base = `/api/admin/songs/${songId}/chord-sources`

  const load = useCallback(async () => {
    const res = await fetch(base)
    if (res.ok) setData((await res.json()) as SourcesResponse)
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  // Mida de cada grup de còpies (només es marquen els grups de més d'una font)
  const groupSizes = useMemo(() => {
    const sizes = new Map<number, number>()
    for (const s of data?.sources ?? []) {
      if (s.group !== null) sizes.set(s.group, (sizes.get(s.group) ?? 0) + 1)
    }
    return sizes
  }, [data])

  async function send(method: "POST" | "PATCH" | "DELETE", body: object | null, okMsg: string): Promise<boolean> {
    const toast = useToastStore.getState().show
    setBusy(true)
    try {
      const url = method === "DELETE" && body ? `${base}?${new URLSearchParams(body as Record<string, string>)}` : base
      const res = await fetch(url, {
        method,
        headers: method !== "DELETE" ? { "Content-Type": "application/json" } : undefined,
        body: method !== "DELETE" ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        toast(err?.error ?? t.admin.toasts.errorAccio, { type: "error" })
        return false
      }
      setData((await res.json()) as SourcesResponse)
      setDirty(true)
      toast(okMsg, { type: "success" })
      return true
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!parseChordSourceUrl(newUrl)) {
      useToastStore.getState().show(tt.urlNoValida, { type: "error" })
      return
    }
    if (await send("POST", { url: newUrl.trim() }, tt.toastAfegida)) setNewUrl("")
  }

  // Mateixa crida que «Actualitza l'anàlisi» de la llista de cançons
  async function handleReanalyze() {
    const toast = useToastStore.getState().show
    setBusy(true)
    try {
      const res = await fetch("/api/admin/transcriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [songId] }),
      })
      if (!res.ok) {
        toast(t.admin.toasts.errorAccio, { type: "error" })
        return
      }
      const { queued } = (await res.json()) as { queued: number }
      toast(queued > 0 ? t.admin.songsTab.toastActualitzacioEncuada : t.admin.songsTab.toastActualitzacioJaEnCua, {
        type: queued > 0 ? "success" : "info",
      })
      if (queued > 0) setDirty(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const reanalyzeTitle = !data?.can_update ? tt.senseAnalisiTitle : data.active_job ? tt.jaEnCua : tt.tornarAnalitzarTitle

  return (
    <AdminDialog
      wide
      title={tt.titol(songTitle)}
      description={tt.descripcio}
      onClose={onClose}
      footer={
        <>
          {dirty && <span className="chord-sources-pending">{tt.pendents}</span>}
          <button
            type="button"
            className="btn-xs success"
            disabled={busy || !data?.can_update || data.active_job}
            title={reanalyzeTitle}
            onClick={() => void handleReanalyze()}
          >
            {tt.tornarAnalitzar}
          </button>
          <button type="button" className="btn-xs" onClick={onClose}>
            {tt.tancar}
          </button>
        </>
      }
    >
      <form className="chord-sources-add" onSubmit={(e) => void handleAdd(e)}>
        <input
          type="url"
          placeholder={tt.afegirPlaceholder}
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn-xs" disabled={busy || !newUrl.trim()}>
          {tt.afegir}
        </button>
      </form>
      <ul className="admin-dialog-list chord-sources-list">
        {!data && <li className="admin-dialog-empty">{tt.carregant}</li>}
        {data?.sources.length === 0 && <li className="admin-dialog-empty">{tt.cap}</li>}
        {data?.sources.map((s) => {
          const copy = s.group !== null && (groupSizes.get(s.group) ?? 0) > 1
          return (
            <li key={s.url} className={s.blocked ? "chord-source is-blocked" : "chord-source"}>
              <div className="chord-source-main">
                <div className="chord-source-head">
                  <strong>{tt.llocs[s.site] ?? s.site}</strong>
                  {s.blocked ? (
                    <span className="badge badge-draft" title={tt.descartadaTitle}>
                      {tt.descartada}
                    </span>
                  ) : s.used ? (
                    <span className="badge badge-public" title={tt.fetaTitle}>
                      {tt.feta}
                    </span>
                  ) : (
                    <span className="badge badge-inactive" title={tt.noFetaTitle}>
                      {tt.noFeta}
                    </span>
                  )}
                  {s.manual && (
                    <span className="badge badge-user" title={tt.manualTitle}>
                      {tt.manual}
                    </span>
                  )}
                  {copy && (
                    <span className="badge badge-user" title={tt.copiaTitle}>
                      {tt.copia(s.group!)}
                    </span>
                  )}
                </div>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="chord-source-url" title={s.url}>
                  {shortUrl(s.url)}
                </a>
                <small className="chord-source-metrics">
                  {s.rating !== null && <span>{tt.valoracio(s.rating.toFixed(1), s.votes)}</span>}
                  <span title={tt.encaixTitle}>{tt.encaix(pct(s.fit))}</span>
                  <span title={tt.lletraTitle}>{tt.lletra(pct(s.matched))}</span>
                  <span title={tt.pesTitle}>{tt.pes(s.weight.toFixed(2))}</span>
                </small>
              </div>
              <div className="chord-source-actions">
                <button
                  type="button"
                  className="btn-xs"
                  disabled={busy}
                  onClick={() =>
                    void send("PATCH", { url: s.url, blocked: !s.blocked }, s.blocked ? tt.toastRecuperada : tt.toastDescartada)
                  }
                >
                  {s.blocked ? tt.recuperar : tt.descartar}
                </button>
                {s.manual && (
                  <button
                    type="button"
                    className="btn-xs danger"
                    disabled={busy}
                    title={tt.treureTitle}
                    onClick={() => void send("DELETE", { url: s.url }, tt.toastTreta)}
                  >
                    {tt.treure}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </AdminDialog>
  )
}
