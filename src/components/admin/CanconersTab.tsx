"use client"
import { useCallback, useEffect, useRef, useState } from "react"

interface CanconerRow {
  id: number
  title: string
  owner_name: string
  song_count: number
  share_token: string | null
  updated_at: string | null
}

export function CanconersTab() {
  const [canconers, setCanconers] = useState<CanconerRow[]>([])
  const [query, setQuery] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/canconers")
    if (!res.ok) return
    const data = (await res.json()) as CanconerRow[]
    setCanconers(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // filtering is done client-side since the API returns all
    }, 250)
  }

  const filtered = query
    ? canconers.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.owner_name.toLowerCase().includes(query.toLowerCase()),
      )
    : canconers

  async function handleDelete(id: number, title: string, ownerName: string) {
    if (!confirm(`Eliminar el cançoner "${title}" de ${ownerName}?`)) return
    const res = await fetch(`/api/admin/canconers/${id}`, { method: "DELETE" })
    if (!res.ok) return
    await load()
  }

  return (
    <>
      <div className="panel-toolbar">
        <input
          type="text"
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
            <th>Usuari</th>
            <th>Cançons</th>
            <th>Compartit</th>
            <th>Actualitzat</th>
            <th>Accions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}
              >
                Cap cançoner trobat
              </td>
            </tr>
          ) : (
            filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.title}</strong>
                </td>
                <td style={{ fontSize: ".82rem" }}>{c.owner_name}</td>
                <td style={{ textAlign: "center" }}>{c.song_count}</td>
                <td style={{ textAlign: "center" }}>
                  {c.share_token ? (
                    <a
                      href={`/c/${c.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-xs success"
                    >
                      🔗 Veure
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: ".78rem" }}>No</span>
                  )}
                </td>
                <td style={{ fontSize: ".78rem", color: "var(--muted)" }}>
                  {new Date(c.updated_at ?? "").toLocaleDateString("ca-ES")}
                </td>
                <td className="td-actions">
                  <button
                    className="btn-xs danger"
                    onClick={() => handleDelete(c.id, c.title, c.owner_name)}
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
