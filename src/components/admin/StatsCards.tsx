"use client"
import { useEffect, useState } from "react"
import { getT } from "@/lib/i18n"

interface Stats {
  songs: number
  drafts: number
  users: number
  canconers: number
  pending: number
}

export function StatsCards() {
  const t = getT()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d: Stats) => setStats(d))
      .catch(() => {})
  }, [])

  return (
    <div id="stats-grid">
      <div className="stat-card">
        <div className="stat-num" id="sn-songs">
          {stats?.songs ?? "—"}
        </div>
        <div className="stat-label">{t.admin.statsCards.canconsPubliques}</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-drafts">
          {stats?.drafts ?? "—"}
        </div>
        <div className="stat-label">{t.admin.statsCards.esborranys}</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-users">
          {stats?.users ?? "—"}
        </div>
        <div className="stat-label">{t.admin.statsCards.usuaris}</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-canconers">
          {stats?.canconers ?? "—"}
        </div>
        <div className="stat-label">{t.admin.statsCards.canconers}</div>
      </div>
    </div>
  )
}
