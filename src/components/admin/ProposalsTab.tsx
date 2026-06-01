"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { getT } from "@/lib/i18n"

interface Proposal {
  id: number
  song_id: number
  song_title: string
  song_artist: string
  song_album: string | null
  song_year: number | null
  status: "pending" | "approved" | "rejected" | "cancelled"
  proposer_name: string
  proposer_avatar: string | null
  notes: string | null
  created_at: string | null
  resubmitted_at: string | null
}

interface Props {
  onChange: () => void
}

type SortKey =
  | "title"
  | "artist"
  | "year"
  | "album"
  | "created_at"
  | "proposer"
type SortDir = "asc" | "desc"

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function compareProposals(a: Proposal, b: Proposal, key: SortKey): number {
  switch (key) {
    case "title":
      return normalize(a.song_title).localeCompare(normalize(b.song_title), "ca")
    case "artist":
      return normalize(a.song_artist).localeCompare(normalize(b.song_artist), "ca")
    case "album": {
      const av = a.song_album ?? ""
      const bv = b.song_album ?? ""
      if (!av && bv) return 1
      if (av && !bv) return -1
      return normalize(av).localeCompare(normalize(bv), "ca")
    }
    case "year": {
      const av = a.song_year
      const bv = b.song_year
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return av - bv
    }
    case "created_at": {
      const av = a.created_at ?? ""
      const bv = b.created_at ?? ""
      return av.localeCompare(bv)
    }
    case "proposer":
      return normalize(a.proposer_name).localeCompare(normalize(b.proposer_name), "ca")
  }
}

export function ProposalsTab({ onChange: _onChange }: Props) {
  const t = getT()
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [filter, setFilter] = useState<string>("pending")
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const STATUS_LABELS: Record<string, string> = {
    pending: t.admin.proposalsTab.statusLabels.pending,
    approved: t.admin.proposalsTab.statusLabels.approved,
    rejected: t.admin.proposalsTab.statusLabels.rejected,
    cancelled: t.admin.proposalsTab.statusLabels.cancelled,
  }

  const SORT_LABELS: Record<SortKey, string> = {
    title: t.admin.proposalsTab.sortLabels.titol,
    artist: t.admin.proposalsTab.sortLabels.artista,
    year: t.admin.proposalsTab.sortLabels.any,
    album: t.admin.proposalsTab.sortLabels.album,
    created_at: t.admin.proposalsTab.sortLabels.createdAt,
    proposer: t.admin.proposalsTab.sortLabels.proposer,
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/proposals")
    if (!res.ok) return
    const data = (await res.json()) as Proposal[]
    setProposals(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    const byStatus = filter
      ? proposals.filter((p) => p.status === filter)
      : proposals
    const q = normalize(query.trim())
    const bySearch = q
      ? byStatus.filter((p) => {
          return (
            normalize(p.song_title).includes(q) ||
            normalize(p.song_artist).includes(q) ||
            normalize(p.proposer_name).includes(q) ||
            (p.song_album && normalize(p.song_album).includes(q))
          )
        })
      : byStatus
    const sorted = [...bySearch].sort((a, b) => compareProposals(a, b, sortKey))
    return sortDir === "asc" ? sorted : sorted.reverse()
  }, [proposals, filter, query, sortKey, sortDir])

  return (
    <>
      <div className="panel-toolbar">
        <input
          type="text"
          id="proposals-search"
          placeholder={t.admin.proposalsTab.cercaPlaceholder}
          style={{ flex: "1 1 240px", maxWidth: 360 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          id="proposal-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending">{t.admin.proposalsTab.pendents}</option>
          <option value="approved">{t.admin.proposalsTab.aprovades}</option>
          <option value="rejected">{t.admin.proposalsTab.rebutjades}</option>
          <option value="cancelled">{t.admin.proposalsTab.cancellades}</option>
          <option value="">{t.admin.proposalsTab.totes}</option>
        </select>
        <select
          id="proposal-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          title={t.admin.proposalsTab.ordenarPerTitle}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-xs"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          title={sortDir === "asc" ? t.admin.proposalsTab.ascendent : t.admin.proposalsTab.descendent}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div id="proposals-empty" className="empty-state">
          <span>✅</span>
          <p>{t.admin.proposalsTab.capPropostaEnAquestaCategoria}</p>
        </div>
      ) : (
        <ul id="proposals-list">
          {visible.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.proposer_avatar || "/img/Logo.png"}
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
                    {t.admin.proposalsTab.per} {p.song_artist}
                    {p.song_year ? ` · ${p.song_year}` : ""}
                    {p.song_album ? ` · ${p.song_album}` : ""}
                  </span>
                </div>
                <div className="prop-meta">
                  {t.admin.proposalsTab.proposatPer} {p.proposer_name} ·{" "}
                  {new Date(p.created_at ?? "").toLocaleDateString("ca-ES")}
                  {p.resubmitted_at && (
                    <span
                      className="badge-resubmitted"
                      title={`${t.admin.proposalsTab.reEnviada} ${new Date(
                        p.resubmitted_at,
                      ).toLocaleDateString("ca-ES")}`}
                    >
                      {t.admin.proposalsTab.reEnviada}
                    </span>
                  )}
                </div>
                {p.notes && <div className="prop-notes">{t.admin.proposalsTab.notaAdmin} {p.notes}</div>}
              </div>
              <span
                className={`badge ${
                  p.status === "pending"
                    ? "badge-draft"
                    : p.status === "approved"
                      ? "badge-public"
                      : p.status === "rejected"
                        ? "badge-inactive"
                        : "badge-cancelled"
                }`}
              >
                {STATUS_LABELS[p.status]}
              </span>
              {p.status === "pending" && (
                <button
                  className="btn-xs"
                  onClick={() => router.push(`/app/editor?proposal=${p.id}`)}
                >
                  {t.admin.proposalsTab.revisar}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
