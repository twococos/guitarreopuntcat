"use client"
import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { getT } from "@/lib/i18n"

interface UserRow {
  id: number
  name: string
  email: string
  avatar_url: string | null
  role: "user" | "admin"
  active: boolean
  canconer_count: number
  created_at: string | null
}

export function UsersTab() {
  const t = getT()
  const { data: session } = useSession()
  const [users, setUsers] = useState<UserRow[]>([])

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users")
    if (!res.ok) return
    const data = (await res.json()) as UserRow[]
    setUsers(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleToggleRole(u: UserRow) {
    const newRole = u.role === "admin" ? "user" : "admin"
    const label = newRole === "admin" ? t.admin.usersTab.ferAdminLabel : t.admin.usersTab.ferUsuariLabel
    if (!confirm(t.admin.usersTab.confirmToggleRol(label, u.name))) return
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })
    if (!res.ok) return
    await load()
  }

  async function handleToggleActive(u: UserRow) {
    const action = u.active ? t.admin.usersTab.desactivarLabel : t.admin.usersTab.activarLabel
    if (!confirm(t.admin.usersTab.confirmToggleActiu(action, u.name))) return
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    })
    if (!res.ok) return
    await load()
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t.admin.usersTab.colUsuari}</th>
          <th>{t.admin.usersTab.colEmail}</th>
          <th>{t.admin.usersTab.colRol}</th>
          <th>{t.admin.usersTab.colCanconers}</th>
          <th>{t.admin.usersTab.colRegistre}</th>
          <th>{t.admin.usersTab.colAccions}</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const isMe = String(u.id) === session?.user?.id
          return (
            <tr key={u.id}>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.avatar_url ?? ""} className="user-row-avatar" alt="" />
                {u.name}{" "}
                {isMe && (
                  <span style={{ color: "var(--muted)", fontSize: ".72rem" }}>{t.admin.usersTab.tu}</span>
                )}
              </td>
              <td style={{ fontSize: ".8rem", color: "var(--muted)" }}>{u.email}</td>
              <td>
                <span className={`badge badge-${u.role}`}>{u.role}</span>
              </td>
              <td style={{ textAlign: "center" }}>{u.canconer_count}</td>
              <td style={{ fontSize: ".75rem", color: "var(--muted)" }}>
                {new Date(u.created_at ?? "").toLocaleDateString("ca-ES")}
              </td>
              <td className="td-actions">
                {isMe ? (
                  "—"
                ) : (
                  <>
                    <button
                      className={`btn-xs ${u.role !== "admin" ? "success" : ""}`}
                      onClick={() => handleToggleRole(u)}
                    >
                      {u.role === "admin" ? t.admin.usersTab.ferUsuari : t.admin.usersTab.ferAdmin}
                    </button>
                    <button
                      className={`btn-xs ${u.active ? "danger" : ""}`}
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.active ? t.admin.usersTab.desactivar : t.admin.usersTab.activar}
                    </button>
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
