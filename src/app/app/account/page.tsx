"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AppHeader } from "@/components/songbook/AppHeader"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { ProfileCard } from "@/components/account/ProfileCard"
import { StatsCard } from "@/components/account/StatsCard"
import { DangerZoneCard } from "@/components/account/DangerZoneCard"
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

export default function AccountPage() {
  const t = getT()
  const router = useRouter()
  const { status } = useSession()
  const [data, setData] = useState<AccountSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  // Fetch account data when authenticated
  useEffect(() => {
    if (status !== "authenticated") return
    let cancelled = false
    fetch("/api/account")
      .then((res) => {
        if (!res.ok) throw new Error("fail")
        return res.json() as Promise<AccountSummary>
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setError(t.app.account.stats.errorCarregar)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [status, t.app.account.stats.errorCarregar])

  if (status === "loading") {
    return <div style={{ padding: "2rem" }}>{t.common.accions.carregant}</div>
  }
  if (status === "unauthenticated") {
    return null
  }

  return (
    <>
      <AppHeader
        subtitle={t.app.account.titol}
        backLink={{ href: "/app", label: t.app.account.backLink }}
        actions={<UserWidget />}
      />

      {loading ? (
        <div style={{ padding: "2rem" }}>{t.common.accions.carregant}</div>
      ) : error || !data ? (
        <div style={{ padding: "2rem" }}>{error ?? t.app.account.stats.errorCarregar}</div>
      ) : (
        <div className="account-page">
          <div className="account-grid">
            <ProfileCard
              data={data}
              onUpdated={(newName) => setData({ ...data, name: newName })}
            />
            <StatsCard data={data} />
          </div>
          <div className="account-grid" style={{ marginTop: "1.5rem" }}>
            <DangerZoneCard />
          </div>
        </div>
      )}

      <ToastHost />
    </>
  )
}
