"use client"
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

interface StatsCardProps {
  data: AccountSummary
}

export function StatsCard({ data }: StatsCardProps) {
  const t = getT()

  return (
    <div className="account-card">
      <h2 className="account-card-title">{t.app.account.stats.titol}</h2>
      {data.created_at && (
        <div className="account-stat-row">
          <span className="account-stat-label">{t.app.account.stats.membreDesDe}</span>
          <span className="account-stat-value">{t.app.account.stats.dataFormat(data.created_at)}</span>
        </div>
      )}
      <div className="account-stat-row">
        <span className="account-stat-label">{t.app.account.stats.canconers}</span>
        <span className="account-stat-value">{data.canconer_count}</span>
      </div>
      <div className="account-stat-row">
        <span className="account-stat-label">{t.app.account.stats.propostes}</span>
        <span className="account-stat-value">
          {data.proposal_count}
          {data.pending_proposal_count > 0 && (
            <span style={{ color: "var(--muted, #888)", fontWeight: 400, marginLeft: "0.4rem" }}>
              ({t.app.account.stats.pendents(data.pending_proposal_count)})
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
