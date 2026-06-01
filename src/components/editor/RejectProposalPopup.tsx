"use client"

import { useState } from "react"
import { getT } from "@/lib/i18n"

interface RejectProposalPopupProps {
  proposerName: string
  saving: boolean
  onCancel: () => void
  onSubmit: (reason: string) => void
}

export function RejectProposalPopup({
  proposerName,
  saving,
  onCancel,
  onSubmit,
}: RejectProposalPopupProps) {
  const t = getT()
  const [reason, setReason] = useState("")
  const trimmed = reason.trim()
  const isDisabled = saving || trimmed === ""

  function handleSubmit() {
    if (isDisabled) return
    onSubmit(trimmed)
  }

  return (
    <div id="reject-proposal-overlay">
      <div id="reject-proposal-box">
        <h2>{t.editor.reject.titol(proposerName)}</h2>
        <p>{t.editor.reject.descripcio}</p>
        <textarea
          className="reject-reason-input"
          rows={5}
          placeholder={t.editor.reject.motiuPlaceholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={saving}
          autoFocus
        />
        <div className="reject-proposal-actions">
          <button
            className="btn-manual"
            onClick={onCancel}
            disabled={saving}
          >
            {t.editor.reject.cancellar}
          </button>
          <button
            className="btn-reject"
            onClick={handleSubmit}
            disabled={isDisabled}
          >
            {saving ? t.editor.reject.enviant : t.editor.reject.enviar}
          </button>
        </div>
      </div>
    </div>
  )
}
