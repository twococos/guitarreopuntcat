"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"

type AccountSummary = {
  id: number
  name: string
  email: string
  avatar_url: string | null
  google_name: string | null
  created_at: string | null
  canconer_count: number
  proposal_count: number
  pending_proposal_count: number
}

interface ProfileCardProps {
  data: AccountSummary
  onUpdated: (newName: string) => void
}

export function ProfileCard({ data, onUpdated }: ProfileCardProps) {
  const t = getT()
  const { update: updateSession } = useSession()
  const [name, setName] = useState(data.name)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const trimmed = name.trim()
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error("fail")
      useToastStore.getState().show(t.app.account.profile.toastGuardat, { type: "success" })
      onUpdated(trimmed)
      // Refresca la sessió perquè el UserWidget mostri el nom nou sense
      // recarregar la pàgina. El callback session() rellegeix `name` de la BD.
      await updateSession()
    } catch {
      useToastStore.getState().show(t.app.account.profile.toastError, { type: "error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="account-card">
      <h2 className="account-card-title">{t.app.account.profile.titol}</h2>
      <div className="account-profile-header">
        {data.avatar_url && <img src={data.avatar_url} alt="" className="user-avatar-xl" />}
        <div>
          <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{data.name || "—"}</div>
          <div style={{ color: "var(--muted, #888)", fontSize: "0.9rem" }}>{data.email}</div>
        </div>
      </div>

      <div className="account-field">
        <label htmlFor="account-name-input">{t.app.account.profile.nomLabel}</label>
        <input
          id="account-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        {data.google_name && data.google_name !== data.name && (
          <div className="account-field-hint">{t.app.account.profile.googleNameNota(data.google_name)}</div>
        )}
      </div>

      <div className="account-field">
        <label htmlFor="account-email-input">{t.app.account.profile.emailLabel}</label>
        <input id="account-email-input" type="email" value={data.email} readOnly />
        <div className="account-field-hint">{t.app.account.profile.emailHint}</div>
      </div>

      <div className="account-actions">
        <button
          className="btn-primary"
          disabled={saving || name.trim() === data.name || name.trim().length < 1}
          onClick={save}
        >
          {saving ? t.app.account.profile.guardant : t.app.account.profile.guardar}
        </button>
      </div>
    </div>
  )
}
