"use client"
import { useState } from "react"
import { signOut } from "next-auth/react"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"

export function DangerZoneCard() {
  const t = getT()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    setDeleting(true)
    try {
      const res = await fetch("/api/account", { method: "DELETE" })
      if (!res.ok) throw new Error("fail")
      useToastStore.getState().show(t.app.account.danger.toastEliminat, { type: "success" })
      await signOut({ callbackUrl: "/" })
    } catch {
      useToastStore.getState().show(t.app.account.danger.toastError, { type: "error" })
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="account-card account-card-full account-danger">
        <h2 className="account-danger-title">{t.app.account.danger.titol}</h2>
        <p className="account-danger-text">{t.app.account.danger.descripcio}</p>
        <button className="btn-danger" onClick={() => setShowConfirm(true)}>
          {t.app.account.danger.botoEliminar}
        </button>
      </div>

      {showConfirm && (
        <div className="account-confirm-dialog" onClick={() => !deleting && setShowConfirm(false)}>
          <div className="account-confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 0.75rem 0", color: "#b03030" }}>{t.app.account.danger.confirmTitol}</h3>
            <p style={{ margin: "0 0 1rem 0", color: "#555", fontSize: "0.9rem", lineHeight: 1.5 }}>
              {t.app.account.danger.confirmMissatge}
            </p>
            <div className="account-field">
              <label htmlFor="confirm-delete-input">{t.app.account.danger.confirmInputLabel}</label>
              <input
                id="confirm-delete-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t.app.account.danger.confirmInputPlaceholder}
                disabled={deleting}
                autoFocus
              />
            </div>
            <div className="account-actions">
              <button
                className="btn-primary"
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                style={{ background: "#888" }}
              >
                {t.app.account.danger.cancellar}
              </button>
              <button
                className="btn-danger"
                disabled={deleting || confirmText !== t.app.account.danger.confirmParaula}
                onClick={confirmDelete}
              >
                {deleting ? t.app.account.danger.eliminant : t.app.account.danger.confirmBoto}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
