"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useToastStore } from "@/hooks/useToasts"
import { SongView } from "@/components/song/SongView"
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconRevoke,
} from "@/components/shared/Icons"
import { getT } from "@/lib/i18n"

// ─── Tipus locals ──────────────────────────────────────────────

type ProposalStatus = "pending" | "approved" | "rejected" | "cancelled"

interface Proposal {
  id: number
  user_id: number
  song_id: number
  status: ProposalStatus
  reviewer_id: number | null
  notes: string | null
  created_at: string | null
  reviewed_at: string | null
  resubmitted_at: string | null
  song_title: string
  song_artist: string
  proposer_name: string
  proposer_avatar: string | null
  reviewer_name: string | null
}

interface SongDetail {
  id: number
  title: string
  artist: string
  key: string
  content: string
  capo: number
  album: string | null
  year: number | null
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Pendent",
  approved: "Acceptada",
  rejected: "Rebutjada",
  cancelled: "Cancel·lada", // no apareixerà a la UI però el tipus l'exigeix
}

// ─── Component ────────────────────────────────────────────────

export function ProposalsTab() {
  const t = getT()
  const router = useRouter()

  const [proposals, setProposals] = useState<Proposal[]>([])
  const [active, setActive] = useState<Proposal | null>(null)
  const [activeSong, setActiveSong] = useState<SongDetail | null>(null)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"created" | "title">("created")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [showPending, setShowPending] = useState(true)
  const [showApproved, setShowApproved] = useState(true)
  const [showRejected, setShowRejected] = useState(true)

  // ─── Càrrega de la llista ──────────────────────────────────

  const loadProposals = useCallback(async () => {
    const res = await fetch("/api/proposals")
    if (!res.ok) return
    const data = (await res.json()) as Proposal[]
    setProposals(data)
  }, [])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  // ─── Selecció de proposta ─────────────────────────────────

  async function selectProposal(p: Proposal) {
    const res = await fetch(`/api/songs/${p.song_id}`)
    if (!res.ok) return
    const detail = (await res.json()) as SongDetail
    setActiveSong(detail)
    setActive(p)
  }

  // ─── Cancel·lació ─────────────────────────────────────────

  async function handleCancel(p: Proposal) {
    if (!confirm(t.app.library.proposalsTab.confirmCancellar(p.song_title))) return
    const res = await fetch(`/api/proposals/${p.id}/cancel`, { method: "POST" })
    if (!res.ok) {
      useToastStore.getState().show(t.app.library.proposalsTab.toastErrorCancellar, { type: "error" })
      return
    }
    useToastStore.getState().show(t.app.library.proposalsTab.toastPropostaCancellada)
    if (active?.id === p.id) {
      setActive(null)
      setActiveSong(null)
    }
    await loadProposals()
  }

  // ─── Filtrat i ordenació (memoitzat) ─────────────────────

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = proposals.filter((p) => {
      if (p.status === "pending" && !showPending) return false
      if (p.status === "approved" && !showApproved) return false
      if (p.status === "rejected" && !showRejected) return false
      if (!q) return true
      return (
        p.song_title.toLowerCase().includes(q) ||
        p.song_artist.toLowerCase().includes(q)
      )
    })
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortBy === "title") cmp = a.song_title.localeCompare(b.song_title, "ca")
      else cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "")
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [proposals, search, sortBy, sortDir, showPending, showApproved, showRejected])

  // ─── Render ───────────────────────────────────────────────

  return (
    <div id="library-proposals">
      {/* Columna esquerra: cerca + filtres + llista de targetes */}
      <section className="library-col library-col-left">
        <div className="library-toolbar">
          <input
            className="library-search"
            type="search"
            placeholder={t.app.library.proposalsTab.cercaPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="library-sort">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "created" | "title")}
            >
              <option value="created">{t.app.library.proposalsTab.colData}</option>
              <option value="title">{t.app.library.proposalsTab.colTitol}</option>
            </select>
            <button
              type="button"
              className="library-sort-dir"
              aria-label={sortDir === "asc" ? t.app.library.proposalsTab.ascendent : t.app.library.proposalsTab.descendent}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <div className="library-filters">
            <label>
              <input
                type="checkbox"
                checked={showPending}
                onChange={(e) => setShowPending(e.target.checked)}
              />{" "}
              {t.app.library.proposalsTab.filtresPendents}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showApproved}
                onChange={(e) => setShowApproved(e.target.checked)}
              />{" "}
              {t.app.library.proposalsTab.filtresAcceptades}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showRejected}
                onChange={(e) => setShowRejected(e.target.checked)}
              />{" "}
              {t.app.library.proposalsTab.filtresRebutjades}
            </label>
          </div>
        </div>

        <ul className="library-cards">
          {visible.map((p) => {
            const isActive = active?.id === p.id
            return (
              <li key={p.id} className={`library-card ${isActive ? "active" : ""}`}>
                {/* Capçalera clicable de la targeta */}
                <button
                  type="button"
                  className="library-card-header"
                  onClick={() => {
                    if (isActive) {
                      setActive(null)
                      setActiveSong(null)
                    } else {
                      void selectProposal(p)
                    }
                  }}
                >
                  <div className="library-card-title">{p.song_title}</div>
                  <div className="library-card-meta">
                    {p.song_artist} ·{" "}
                    {new Date(p.created_at ?? "").toLocaleDateString("ca-ES")}
                    <span className={`library-status status-${p.status}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                </button>

                {/* Secció expandible: accions */}
                <div
                  className="library-card-actions"
                  data-open={isActive ? "true" : "false"}
                >
                  <div className="library-card-actions-inner">
                    {isActive && (
                      <>
                        {p.status === "approved" && (
                          <p className="library-card-info">
                            <IconCheck /> {t.app.library.proposalsTab.cancoPublic}
                          </p>
                        )}
                        {(p.status === "pending" || p.status === "rejected") && (
                          <div className="library-actions-row">
                            <button
                              type="button"
                              className="library-action"
                              onClick={() =>
                                router.push(`/app/editor?proposal=${p.id}&mode=modify`)
                              }
                            >
                              <IconPencil /> {t.app.library.proposalsTab.modificar}
                            </button>
                            <button
                              type="button"
                              className="library-action library-action-danger"
                              onClick={() => void handleCancel(p)}
                            >
                              <IconRevoke /> {t.app.library.proposalsTab.cancellar}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {proposals.length === 0 && (
          <div className="library-empty">
            <p>{t.app.library.proposalsTab.buit}</p>
            <Link href="/app/editor" className="library-empty-btn">
              <IconPlus /> {t.app.library.proposalsTab.ferUnaProposta}
            </Link>
          </div>
        )}
      </section>

      {/* Columna dreta: vista prèvia de la cançó proposada */}
      <section className="library-col library-col-right">
        {active && activeSong ? (
          <>
            {active.status === "rejected" && active.notes && (
              <div className="library-feedback-box">
                <strong>{t.app.library.proposalsTab.retroaccioAdmin}</strong>
                <p>{active.notes}</p>
              </div>
            )}
            <SongView song={activeSong} semitones={0} />
          </>
        ) : (
          <div className="library-placeholder">
            <p>{t.app.library.proposalsTab.seleccionaProposta}</p>
          </div>
        )}
      </section>
    </div>
  )
}
