"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import type { SyncQuality } from "@/lib/transcriber/sync"
import { OwnerPickerDialog } from "./OwnerPickerDialog"
import { OriginalSongPickerDialog } from "./OriginalSongPickerDialog"
import { BadgeMenu } from "./BadgeMenu"

// GET /api/admin/songs (src/db/queries/admin.ts, listSongsForAdmin)
interface SongRow {
  id: number
  title: string
  artist: string
  artist_slug: string | null
  song_slug: string | null
  key: string
  state: number
  kind: "public" | "private" | "arrangement" | "proposal"
  owner: { id: number; name: string; avatar_url: string | null } | null
  original: { id: number; title: string; artist: string } | null
  analysis: { current: boolean; quality: SyncQuality | null } | null
  songbook_count: number
  updated_at: string | null
}

type KindFilter = "all" | "public" | "private" | "arrangement"
type AnalysisFilter = "any" | "none" | "bad"
type Counts = Record<KindFilter, number>

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`)

export function SongsTab({ focusId = null }: { focusId?: number | null }) {
  const t = getT()
  const tt = t.admin.songsTab
  const [songs, setSongs] = useState<SongRow[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<KindFilter>("all")
  const [analysis, setAnalysis] = useState<AnalysisFilter>("any")
  const [focus, setFocus] = useState<number | null>(focusId)
  const [ownerFor, setOwnerFor] = useState<SongRow | null>(null)
  const [originalFor, setOriginalFor] = useState<SongRow | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async (search: string, k: KindFilter, a: AnalysisFilter) => {
    const id = ++requestIdRef.current
    const params = new URLSearchParams({ kind: k, analysis: a })
    if (search) params.set("search", search)
    const res = await fetch(`/api/admin/songs?${params.toString()}`)
    if (!res.ok || id !== requestIdRef.current) return
    const data = (await res.json()) as { songs: SongRow[]; counts: Counts }
    setSongs(data.songs)
    setCounts(data.counts)
  }, [])

  const reload = useCallback(() => load(query, kind, analysis), [load, query, kind, analysis])

  useEffect(() => {
    void load(query, kind, analysis)
    // La cerca té el seu debounce a handleQueryChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, kind, analysis])

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void load(val, kind, analysis)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Ressalta i porta a la vista la fila enfocada (enllaç "Original" o ?focus=)
  useEffect(() => {
    if (focus === null) return
    const el = document.getElementById(`song-row-${focus}`)
    if (!el) return
    el.scrollIntoView({ block: "center", behavior: "smooth" })
    const timer = setTimeout(() => setFocus(null), 2500)
    return () => clearTimeout(timer)
  }, [focus, songs])

  function goToSong(id: number) {
    // Si la fila no és a la llista actual, treu els filtres
    if (!songs.some((s) => s.id === id)) {
      setQuery("")
      setKind("all")
      setAnalysis("any")
      void load("", "all", "any")
    }
    setFocus(id)
  }

  async function patch(id: number, body: object, okMsg: string) {
    const res = await fetch(`/api/admin/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null
      useToastStore.getState().show(err?.error ?? tt.toastError, { type: "error" })
      return
    }
    useToastStore.getState().show(okMsg, { type: "success" })
    await reload()
  }

  function handleKindChange(s: SongRow, next: string) {
    if (next === "public") {
      if (!confirm(tt.confirmFerPublica(s.title))) return
      void patch(s.id, { kind: "public" }, tt.toastTipusCanviat)
    } else if (next === "private") {
      if (!confirm(tt.confirmFerPrivada(s.title, s.kind === "public" ? s.songbook_count : 0))) return
      void patch(s.id, { kind: "private" }, tt.toastTipusCanviat)
    } else if (next === "arrangement") {
      setOriginalFor(s)
    } else if (next === "proposal") {
      if (!confirm(tt.confirmFerProposta(s.title))) return
      void patch(s.id, { kind: "proposal" }, tt.toastMogudaAPropostes)
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(tt.confirmEliminar(title))) return
    const res = await fetch(`/api/songs/${id}`, { method: "DELETE" })
    if (!res.ok) return
    await reload()
  }

  const kindLabel = (k: SongRow["kind"]) =>
    k === "public" ? tt.estatPublica : k === "arrangement" ? tt.estatArranjament : k === "private" ? tt.estatPrivada : tt.estatProposta

  const kindOptions = (["public", "private", "arrangement", "proposal"] as const).map((k) => ({
    value: k,
    label: kindLabel(k),
    badgeClass: `badge badge-kind-${k}`,
    hint:
      k === "public" ? tt.hintPublica : k === "private" ? tt.hintPrivada : k === "arrangement" ? tt.hintArranjament : tt.hintProposta,
  }))

  return (
    <>
      <div className="panel-toolbar admin-songs-toolbar">
        <input
          type="text"
          id="songs-search"
          placeholder={tt.cercaPlaceholder}
          style={{ maxWidth: 260 }}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
        <div className="admin-chips" role="group">
          {(["all", "public", "private", "arrangement"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`admin-chip ${kind === k ? "active" : ""}`}
              onClick={() => setKind(k)}
            >
              {k === "all" ? tt.filtreTotes : k === "public" ? tt.filtrePubliques : k === "private" ? tt.filtrePrivades : tt.filtreArranjaments}
              {counts && <span className="admin-chip-count">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <select value={analysis} onChange={(e) => setAnalysis(e.target.value as AnalysisFilter)}>
          <option value="any">{tt.analisiQualsevol}</option>
          <option value="none">{tt.analisiSense}</option>
          <option value="bad">{tt.analisiDolenta}</option>
        </select>
      </div>
      <table className="admin-songs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{tt.colTitol}</th>
            <th>{tt.colArtista}</th>
            <th>{tt.colTo}</th>
            <th>{tt.colTipus}</th>
            <th>{tt.colPropietari}</th>
            <th>{tt.colOriginal}</th>
            <th>{tt.colAnalisi}</th>
            <th>{tt.colAccions}</th>
          </tr>
        </thead>
        <tbody id="songs-tbody">
          {songs.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>
                {tt.capCancoTrobada}
              </td>
            </tr>
          ) : (
            songs.map((s) => (
              <tr key={s.id} id={`song-row-${s.id}`} className={focus === s.id ? "is-focused" : undefined}>
                <td className="admin-song-id">{s.id}</td>
                <td>
                  <a
                    href={
                      s.kind === "public" && s.artist_slug && s.song_slug
                        ? `/songs/${s.artist_slug}/${s.song_slug}`
                        : `/songs/private/${s.id}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="admin-song-title"
                  >
                    {s.title}
                  </a>
                  {s.songbook_count > 0 && (
                    <div className="admin-song-sub">{tt.enCanconers(s.songbook_count)}</div>
                  )}
                </td>
                <td>{s.artist}</td>
                <td style={{ fontFamily: "monospace" }}>{s.key}</td>
                <td>
                  <BadgeMenu
                    label={kindLabel(s.kind)}
                    badgeClass={`badge badge-kind-${s.kind}`}
                    options={kindOptions}
                    // Un arranjament es pot tornar a triar per canviar-ne l'original
                    current={s.kind === "arrangement" ? undefined : s.kind}
                    onSelect={(v) => handleKindChange(s, v)}
                    title={tt.canviarTipusTitle}
                  />
                </td>
                <td>
                  {s.kind === "public" ? (
                    <span className="admin-muted">—</span>
                  ) : (
                    <button
                      type="button"
                      className="admin-owner-btn"
                      title={tt.canviarPropietari}
                      onClick={() => setOwnerFor(s)}
                    >
                      {s.owner?.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.owner.avatar_url} alt="" className="user-row-avatar" referrerPolicy="no-referrer" />
                      )}
                      {s.owner?.name ?? tt.senseProprietari}
                    </button>
                  )}
                </td>
                <td>
                  {s.original ? (
                    <a
                      href={`#song-row-${s.original.id}`}
                      className="admin-original-link"
                      title={`${s.original.title} — ${s.original.artist}`}
                      onClick={(e) => {
                        e.preventDefault()
                        goToSong(s.original!.id)
                      }}
                    >
                      #{s.original.id} {s.original.title}
                    </a>
                  ) : (
                    <span className="admin-original-empty">
                      <span className="admin-muted">—</span>
                      <button type="button" className="btn-xs admin-make-arrangement" onClick={() => setOriginalFor(s)}>
                        {tt.ferArranjamentBtn}
                      </button>
                    </span>
                  )}
                </td>
                <td>
                  <AnalysisCell analysis={s.analysis} />
                </td>
                <td className="td-actions">
                  <a href={`/app/editor?id=${s.id}`} className="btn-xs">
                    {tt.editar}
                  </a>
                  <button className="btn-xs danger" onClick={() => void handleDelete(s.id, s.title)}>
                    {tt.eliminar}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {ownerFor && (
        <OwnerPickerDialog
          songTitle={ownerFor.title}
          currentOwnerId={ownerFor.owner?.id ?? null}
          onClose={() => setOwnerFor(null)}
          onPick={(userId) => {
            const s = ownerFor
            setOwnerFor(null)
            void patch(s.id, { owner_id: userId }, tt.toastPropietariCanviat)
          }}
        />
      )}

      {originalFor && (
        <OriginalSongPickerDialog
          songId={originalFor.id}
          songTitle={originalFor.title}
          initialQuery={originalFor.original ? `#${originalFor.original.id}` : originalFor.title}
          onClose={() => setOriginalFor(null)}
          onPick={(originalId) => {
            const s = originalFor
            setOriginalFor(null)
            void patch(s.id, { kind: "arrangement", original_song_id: originalId }, tt.toastTipusCanviat)
          }}
        />
      )}
    </>
  )
}

/** Resum de l'anàlisi: sense, obsoleta, o un punt de color + cobertura. */
function AnalysisCell({ analysis }: { analysis: SongRow["analysis"] }) {
  const tt = getT().admin.songsTab
  if (!analysis) return <span className="admin-muted" title={tt.analisiCap}>—</span>
  if (!analysis.current) {
    return <span className="admin-analysis is-stale" title={tt.analisiObsoletaTitle}>{tt.analisiObsoleta}</span>
  }
  const q = analysis.quality
  if (!q) return <span className="admin-muted">?</span>
  const level = q.ok ? "good" : (q.coverage ?? q.chords ?? 0) >= 0.3 ? "fair" : "bad"
  const title = `${q.ok ? tt.analisiOk : tt.analisiNoOk}\n${tt.analisiDetall(pct(q.coverage), pct(q.words), pct(q.chords))}`
  return (
    <span className={`admin-analysis is-${level}`} title={title}>
      <span className="admin-analysis-dot" aria-hidden="true" />
      {pct(q.coverage ?? q.chords)}
    </span>
  )
}
