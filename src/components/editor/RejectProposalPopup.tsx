"use client"

import { useState } from "react"

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
        <h2>Rebutjar proposta de {proposerName}</h2>
        <p>
          Explica el motiu del rebuig perquè el proposant pugui revisar la
          retroacció i, si vol, tornar a enviar la cançó.
        </p>
        <textarea
          className="reject-reason-input"
          rows={5}
          placeholder="Motiu del rebuig…"
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
            Cancel·lar
          </button>
          <button
            className="btn-reject"
            onClick={handleSubmit}
            disabled={isDisabled}
          >
            {saving ? "Enviant…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  )
}
