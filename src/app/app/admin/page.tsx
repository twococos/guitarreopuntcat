"use client"
import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { getT } from "@/lib/i18n"
import { UserWidget } from "@/components/UserWidget"
import { StatsCards } from "@/components/admin/StatsCards"
import { ProposalsTab } from "@/components/admin/ProposalsTab"
import { SongsTab } from "@/components/admin/SongsTab"
import { UsersTab } from "@/components/admin/UsersTab"
import { CanconersTab } from "@/components/admin/CanconersTab"
import {
  IconBarChart,
  IconProposal,
  IconMusic,
  IconUsers,
  IconBookOpen,
} from "@/components/shared/Icons"
import { AppHeader } from "@/components/songbook/AppHeader"

type Tab = "stats" | "proposals" | "songs" | "users" | "canconers"

const VALID_TABS: Tab[] = ["stats", "proposals", "songs", "users", "canconers"]

interface Stats {
  songs: number
  drafts: number
  users: number
  canconers: number
  pending: number
}

export default function AdminPage() {
  const t = getT()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const t = searchParams.get("tab")
    return t && (VALID_TABS as string[]).includes(t) ? (t as Tab) : "stats"
  })()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [pendingCount, setPendingCount] = useState(0)

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats")
    if (!res.ok) return
    const data = (await res.json()) as Stats
    setPendingCount(data.pending)
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const user = session?.user

  return (
    <>
      <AppHeader
        subtitle={t.admin.dashboard.titol}
        backLink={{ href: "/app", label: t.admin.dashboard.backLink }}
        actions={
          <>
            <span className="subtitle" id="admin-welcome">
              {t.admin.dashboard.benvingut(user?.name ?? "")}
            </span>
            <UserWidget />
          </>
        }
      />

      <div id="admin-tabs">
        <button
          className={`tab ${tab === "stats" ? "active" : ""}`}
          onClick={() => setTab("stats")}
        >
          <IconBarChart /> {t.admin.tabs.resum}
        </button>
        <button
          className={`tab ${tab === "proposals" ? "active" : ""}`}
          onClick={() => setTab("proposals")}
        >
          <IconProposal /> {t.admin.tabs.propostes}{" "}
          {pendingCount > 0 && <span id="pending-badge">{pendingCount}</span>}
        </button>
        <button
          className={`tab ${tab === "songs" ? "active" : ""}`}
          onClick={() => setTab("songs")}
        >
          <IconMusic /> {t.admin.tabs.cancons}
        </button>
        <button
          className={`tab ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          <IconUsers /> {t.admin.tabs.usuaris}
        </button>
        <button
          className={`tab ${tab === "canconers" ? "active" : ""}`}
          onClick={() => setTab("canconers")}
        >
          <IconBookOpen /> {t.admin.tabs.canconers}
        </button>
      </div>

      <div id="admin-content">
        {tab === "stats" && <StatsCards />}
        {tab === "proposals" && <ProposalsTab onChange={loadStats} />}
        {tab === "songs" && <SongsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "canconers" && <CanconersTab />}
      </div>
    </>
  )
}
