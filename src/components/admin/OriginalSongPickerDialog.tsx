"use client"
import { useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { AdminDialog } from "./AdminDialog"

interface SongOption {
  id: number
  title: string
  artist: string
  key: string
}

/**
 * Tria la cançó pública de la qual una cançó és arranjament. Cerca amb
 * debounce contra GET /api/admin/songs?kind=public (accepta `#id`) i descarta
 * respostes velles (patró de SearchHero).
 */
export function OriginalSongPickerDialog({
  songId,
  songTitle,
  initialQuery,
  onPick,
  onClose,
}: {
  songId: number
  songTitle: string
  initialQuery: string
  onPick: (originalId: number) => void
  onClose: () => void
}) {
  const t = getT()
  const tt = t.admin.songsTab.originalDialog
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SongOption[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const id = ++requestIdRef.current
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ kind: "public" })
      if (query.trim()) params.set("search", query.trim())
      const res = await fetch(`/api/admin/songs?${params}`)
      if (!res.ok || id !== requestIdRef.current) return
      const data = (await res.json()) as { songs: SongOption[] }
      setResults(data.songs.filter((s) => s.id !== songId).slice(0, 30))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, songId])

  return (
    <AdminDialog
      title={tt.titol(songTitle)}
      description={tt.descripcio}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-xs" onClick={onClose}>
            {tt.cancellar}
          </button>
          <button
            type="button"
            className="btn-xs success"
            disabled={selected === null}
            onClick={() => selected !== null && onPick(selected)}
          >
            {tt.confirmar}
          </button>
        </>
      }
    >
      <input
        type="search"
        className="admin-dialog-search"
        placeholder={tt.cercaPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <ul className="admin-dialog-list" role="listbox">
        {results.length === 0 && <li className="admin-dialog-empty">{tt.cap}</li>}
        {results.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected === s.id}
              className={`admin-dialog-option ${selected === s.id ? "is-selected" : ""}`}
              onClick={() => setSelected(s.id)}
              onDoubleClick={() => onPick(s.id)}
            >
              <span className="admin-dialog-option-id">#{s.id}</span>
              <span className="admin-dialog-option-main">
                <strong>{s.title}</strong>
                <small>{s.artist}</small>
              </span>
              <span className="admin-dialog-option-key">{s.key}</span>
            </button>
          </li>
        ))}
      </ul>
    </AdminDialog>
  )
}
