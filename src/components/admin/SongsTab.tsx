"use client"
import { useCallback, useEffect, useRef, useState } from "react"

interface SongRow {
  id: number
  title: string
  artist: string
  key: string
  draft: number | null
}

export function SongsTab() {
  const [songs, setSongs] = useState<SongRow[]>([])
  const [query, setQuery] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (search: string) => {
    const params = new URLSearchParams({ sortBy: "title" })
    if (search) params.set("search", search)
    const res = await fetch(`/api/songs?${params.toString()}`)
    if (!res.ok) return
    const data = (await res.json()) as SongRow[]
    setSongs(data)
  }, [])

  useEffect(() => {
    load("")
  }, [load])

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      load(val)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Eliminar la cançó "${title}"? Aquesta acció no es pot desfer.`)) return
    const res = await fetch(`/api/songs/${id}`, { method: "DELETE" })
    if (!res.ok) return
    await load(query)
  }

  return (
    <>
      <div className="panel-toolbar">
        <input
          type="text"
          id="songs-search"
          placeholder="Cerca…"
          style={{ maxWidth: 260 }}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Títol</th>
            <th>Artista</th>
            <th>To</th>
            <th>Estat</th>
            <th>Accions</th>
          </tr>
        </thead>
        <tbody id="songs-tbody">
          {songs.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}
              >
                Cap cançó trobada
              </td>
            </tr>
          ) : (
            songs.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.title}</strong>
                </td>
                <td>{s.artist}</td>
                <td style={{ fontFamily: "monospace" }}>{s.key}</td>
                <td>
                  <span className={`badge ${s.draft ? "badge-draft" : "badge-public"}`}>
                    {s.draft ? "Esborrany" : "Pública"}
                  </span>
                </td>
                <td className="td-actions">
                  <a href={`/editor?id=${s.id}`} className="btn-xs">
                    Editar
                  </a>
                  <button
                    className="btn-xs danger"
                    onClick={() => handleDelete(s.id, s.title)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  )
}
