"use client"
import { useEffect, useState } from "react"

interface Proposal {
  id: number
  song_id: number
  song_title: string
  song_artist: string
  proposer_name: string
  notes: string | null
}

interface SongDetail {
  id: number
  title: string
  artist: string
  key: string
  capo: number
  content: string
}

interface Props {
  proposal: Proposal
  onClose: () => void
  onDone: () => void
}

export function ReviewModal({ proposal, onClose, onDone }: Props) {
  const [song, setSong] = useState<SongDetail | null>(null)
  const [notes, setNotes] = useState("")

  useEffect(() => {
    fetch(`/api/songs/${proposal.song_id}`)
      .then((r) => r.json())
      .then((d: SongDetail) => setSong(d))
      .catch(() => {})
  }, [proposal.song_id])

  async function submit(status: "approved" | "rejected") {
    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    })
    if (!res.ok) return
    onDone()
  }

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div id="review-modal" onClick={onBackdropClick}>
      <div id="review-box">
        <button id="review-close" onClick={onClose}>
          ✕
        </button>
        {song ? (
          <>
            <h2 id="review-title">
              {song.title} — {song.artist}
            </h2>
            <p id="review-meta">
              To: {song.key}
              {song.capo ? ` · Cejilla ${song.capo}` : ""} · Proposat per{" "}
              {proposal.proposer_name}
            </p>
            {/* eslint-disable-next-line react/no-danger */}
            <div id="review-content" dangerouslySetInnerHTML={{ __html: song.content }} />
          </>
        ) : (
          <p>Carregant…</p>
        )}
        <hr />
        <label>
          Nota per al proposant (opcional)
          <textarea
            id="review-notes"
            rows={3}
            placeholder="Motiu de la decisió…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="review-actions">
          <button id="btn-approve" className="btn-approve" onClick={() => submit("approved")}>
            ✓ Aprovar
          </button>
          <button id="btn-reject" className="btn-reject" onClick={() => submit("rejected")}>
            ✕ Rebutjar
          </button>
        </div>
      </div>
    </div>
  )
}
