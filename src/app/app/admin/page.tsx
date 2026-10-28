"use client"
import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { getT } from "@/lib/i18n"
import { UserWidget } from "@/components/UserWidget"
import { StatsCards } from "@/components/admin/StatsCards"
import { ProposalsTab } from "@/components/admin/ProposalsTab"
import { SongsTab } from "@/components/admin/SongsTab"
import { UsersTab } from "@/components/admin/UsersTab"
import { CanconersTab } from "@/components/admin/CanconersTab"
import { TranscriptionsTab } from "@/components/admin/TranscriptionsTab"
import { ImportTab } from "@/components/admin/import/ImportTab"
import { ReportsTab } from "@/components/admin/ReportsTab"
import { AnalyticsPanel } from "@/components/admin/analytics/AnalyticsPanel"
import {
  IconBarChart,
  IconProposal,
  IconMusic,
  IconUsers,
  IconBookOpen,
  IconWand,
  IconFlag,
  IconDownload,
} from "@/components/shared/Icons"
import { AppHeader } from "@/components/songbook/AppHeader"

type Tab = "stats" | "proposals" | "reports" | "songs" | "users" | "canconers" | "import" | "transcriptions" | "analytics"

const VALID_TABS: Tab[] = [
  "stats",
  "proposals",
  "reports",
  "songs",
  "users",
  "canconers",
  "import",
  "transcriptions",
  "analytics",
]

interface Stats {
  songs: number
  drafts: number
  users: number
  canconers: number
  pending: number
  reports_pending: number
}

export default function AdminPage() {
  const t = getT()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const t = searchParams.get("tab")
    return t && (VALID_TABS as string[]).includes(t) ? (t as Tab) : "stats"
  })()
  const [tab, setTabState] = useState<Tab>(initialTab)
  const router = useRouter()
  // Cançó a ressaltar a la pestanya Cançons (?tab=songs&focus=ID)
  const focusRaw = Number(searchParams.get("focus"))
  const focusId = Number.isInteger(focusRaw) && focusRaw > 0 ? focusRaw : null

  // La pestanya activa queda a la URL (enllaçable i amb el botó enrere)
  function setTab(next: Tab) {
    setTabState(next)
    router.replace(`/app/admin?tab=${next}`, { scroll: false })
  }
  const [pendingCount, setPendingCount] = useState(0)
  const [reportsCount, setReportsCount] = useState(0)

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats")
    if (!res.ok) return
    const data = (await res.json()) as Stats
    setPendingCount(data.pending)
    setReportsCount(data.reports_pending)
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
          className={`tab ${tab === "reports" ? "active" : ""}`}
          onClick={() => setTab("reports")}
        >
          <IconFlag /> {t.admin.tabs.errors}{" "}
          {reportsCount > 0 && <span className="pending-badge">{reportsCount}</span>}
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
        <button
          className={`tab ${tab === "import" ? "active" : ""}`}
          onClick={() => setTab("import")}
        >
          <IconDownload /> {t.admin.tabs.importar}
        </button>
        <button
          className={`tab ${tab === "transcriptions" ? "active" : ""}`}
          onClick={() => setTab("transcriptions")}
        >
          <IconWand /> {t.admin.tabs.transcripcions}
        </button>
        <button
          className={`tab ${tab === "analytics" ? "active" : ""}`}
          onClick={() => setTab("analytics")}
        >
          <IconBarChart /> {t.analytics.title}
        </button>
      </div>

      <div id="admin-content">
        {tab === "stats" && <StatsCards />}
        {tab === "proposals" && <ProposalsTab onChange={loadStats} />}
        {tab === "reports" && <ReportsTab onChange={loadStats} />}
        {tab === "songs" && <SongsTab focusId={focusId} />}
        {tab === "users" && <UsersTab />}
        {tab === "canconers" && <CanconersTab />}
        {tab === "import" && <ImportTab onGoToQueue={() => setTab("transcriptions")} />}
        {tab === "transcriptions" && <TranscriptionsTab />}
        {tab === "analytics" && <AnalyticsPanel />}
      </div>
    </>
  )
}
