"use client"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface Proposal {
  id: number
  song_id: number
  song_title: string
  song_artist: string
  status: "pending" | "approved" | "rejected"
  proposer_name: string
  proposer_avatar: string | null
  notes: string | null
  created_at: string | null
}

interface Props {
  onChange: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendent",
  approved: "Aprovada",
  rejected: "Rebutjada",
}

export function ProposalsTab({ onChange: _onChange }: Props) {
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [filter, setFilter] = useState<string>("pending")

  const load = useCallback(async () => {
    const res = await fetch("/api/proposals")
    if (!res.ok) return
    const data = (await res.json()) as Proposal[]
    setProposals(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = filter
    ? proposals.filter((p) => p.status === filter)
    : proposals

  return (
    <>
      <div className="panel-toolbar">
        <select
          id="proposal-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending">Pendents</option>
          <option value="approved">Aprovades</option>
          <option value="rejected">Rebutjades</option>
          <option value="">Totes</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div id="proposals-empty" className="empty-state">
          <span>✅</span>
          <p>Cap proposta en aquesta categoria.</p>
        </div>
      ) : (
        <ul id="proposals-list">
          {filtered.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.proposer_avatar ?? ""}
                className="user-row-avatar"
                alt=""
              />
              <div className="prop-info">
                <div className="prop-title">
                  {p.song_title}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--muted)",
                      fontSize: ".82rem",
                    }}
                  >
                    {" "}
                    per {p.song_artist}
                  </span>
                </div>
                <div className="prop-meta">
                  Proposat per {p.proposer_name} ·{" "}
                  {new Date(p.created_at ?? "").toLocaleDateString("ca-ES")}
                </div>
                {p.notes && <div className="prop-notes">Nota admin: {p.notes}</div>}
              </div>
              <span
                className={`badge ${
                  p.status === "pending"
                    ? "badge-draft"
                    : p.status === "approved"
                    ? "badge-public"
                    : "badge-inactive"
                }`}
              >
                {STATUS_LABELS[p.status]}
              </span>
              {p.status === "pending" && (
                <button
                  className="btn-xs"
                  onClick={() => router.push(`/editor?proposal=${p.id}`)}
                >
                  Revisar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
