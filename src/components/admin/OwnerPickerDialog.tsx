"use client"
import { useEffect, useMemo, useState } from "react"
import { getT } from "@/lib/i18n"
import { AdminDialog } from "./AdminDialog"

interface UserOption {
  id: number
  name: string
  email: string
  avatar_url: string | null
  active: number | null
}

/** Tria l'usuari propietari d'una cançó privada (llista de GET /api/admin/users). */
export function OwnerPickerDialog({
  songTitle,
  currentOwnerId,
  onPick,
  onClose,
}: {
  songTitle: string
  currentOwnerId: number | null
  onPick: (userId: number) => void
  onClose: () => void
}) {
  const t = getT()
  const tt = t.admin.songsTab.ownerDialog
  const [users, setUsers] = useState<UserOption[]>([])
  const [query, setQuery] = useState("")

  useEffect(() => {
    void fetch("/api/admin/users")
      .then((r) => (r.ok ? (r.json() as Promise<UserOption[]>) : []))
      .then(setUsers)
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [users, query])

  return (
    <AdminDialog
      title={tt.titol(songTitle)}
      onClose={onClose}
      footer={
        <button type="button" className="btn-xs" onClick={onClose}>
          {tt.cancellar}
        </button>
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
      <ul className="admin-dialog-list">
        {visible.length === 0 && <li className="admin-dialog-empty">{tt.cap}</li>}
        {visible.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              className={`admin-dialog-option ${u.id === currentOwnerId ? "is-current" : ""}`}
              onClick={() => onPick(u.id)}
              disabled={u.id === currentOwnerId}
            >
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt="" className="user-row-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-row-avatar admin-avatar-fallback">{u.name.charAt(0)}</span>
              )}
              <span className="admin-dialog-option-main">
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
              {u.id === currentOwnerId && <span className="badge badge-user">{tt.actual}</span>}
            </button>
          </li>
        ))}
      </ul>
    </AdminDialog>
  )
}
