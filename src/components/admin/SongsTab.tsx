"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"

interface SongRow {
  id: number
  title: string
  artist: string
  key: string
  state: number
}

export function SongsTab() {
  const t = getT()
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
    if (!confirm(t.admin.songsTab.confirmEliminar(title))) return
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
          placeholder={t.admin.songsTab.cercaPlaceholder}
          style={{ maxWidth: 260 }}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>{t.admin.songsTab.colTitol}</th>
            <th>{t.admin.songsTab.colArtista}</th>
            <th>{t.admin.songsTab.colTo}</th>
            <th>{t.admin.songsTab.colEstat}</th>
            <th>{t.admin.songsTab.colAccions}</th>
          </tr>
        </thead>
        <tbody id="songs-tbody">
          {songs.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}
              >
                {t.admin.songsTab.capCancoTrobada}
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
                  <span className={`badge ${s.state === 0 ? "badge-public" : "badge-draft"}`}>
                    {s.state === 0 ? t.admin.songsTab.estatPublica : s.state === 2 ? t.admin.songsTab.estatPendent : s.state === 3 ? t.admin.songsTab.estatRebutjada : s.state === 4 ? t.admin.songsTab.estatCancellada : t.admin.songsTab.estatPrivada}
                  </span>
                </td>
                <td className="td-actions">
                  <a href={`/app/editor?id=${s.id}`} className="btn-xs">
                    {t.admin.songsTab.editar}
                  </a>
                  <button
                    className="btn-xs danger"
                    onClick={() => handleDelete(s.id, s.title)}
                  >
                    {t.admin.songsTab.eliminar}
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
