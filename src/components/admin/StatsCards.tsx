"use client"
import { useEffect, useState } from "react"

interface Stats {
  songs: number
  drafts: number
  users: number
  canconers: number
  pending: number
}

export function StatsCards() {
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
        <div className="stat-label">Cançons públiques</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-drafts">
          {stats?.drafts ?? "—"}
        </div>
        <div className="stat-label">Esborranys</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-users">
          {stats?.users ?? "—"}
        </div>
        <div className="stat-label">Usuaris</div>
      </div>
      <div className="stat-card">
        <div className="stat-num" id="sn-canconers">
          {stats?.canconers ?? "—"}
        </div>
        <div className="stat-label">Cançoners</div>
      </div>
    </div>
  )
}
