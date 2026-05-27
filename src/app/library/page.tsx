"use client"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { IconLibrary, IconProposal } from "@/components/shared/Icons"
import { CanconersTab } from "./CanconersTab"
import { ProposalsTab } from "./ProposalsTab"

type Tab = "canconers" | "proposals"

const VALID_TABS: Tab[] = ["canconers", "proposals"]

export default function LibraryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const isAdmin = session?.user?.role === "admin"

  // Sincronització de la pestanya activa amb el query param ?tab=…
  // Els admins no poden veure ni accedir a la pestanya de propostes:
  // si la URL hi entra, els forcem a la de cançoners.
  const initialTab: Tab = (() => {
    const t = searchParams.get("tab")
    if (t === "proposals" && isAdmin) return "canconers"
    return t && (VALID_TABS as string[]).includes(t) ? (t as Tab) : "canconers"
  })()
  const [tab, setTab] = useState<Tab>(initialTab)

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/")
    }
  }, [status, router])

  // Si un admin acaba a tab=proposals (per ex. navegació posterior),
  // el reconduïm a canconers.
  useEffect(() => {
    if (isAdmin && tab === "proposals") setTab("canconers")
  }, [isAdmin, tab])

  function changeTab(next: Tab) {
    setTab(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next)
    router.replace(`/library?${params.toString()}`, { scroll: false })
  }

  if (status === "loading") {
    return <div style={{ padding: "2rem" }}>Carregant…</div>
  }
  if (status === "unauthenticated") {
    return null
  }

  return (
    <>
      <header>
        <Link href="/" className="back-link">
          ← Cançoner
        </Link>
        <h1>
          <IconLibrary /> La teva Biblioteca
        </h1>
        <div className="header-actions">
          <UserWidget />
        </div>
      </header>

      <div id="library-tabs">
        <button
          className={`tab ${tab === "canconers" ? "active" : ""}`}
          onClick={() => changeTab("canconers")}
        >
          <IconLibrary /> Cançoners
        </button>
        {!isAdmin && (
          <button
            className={`tab ${tab === "proposals" ? "active" : ""}`}
            onClick={() => changeTab("proposals")}
          >
            <IconProposal /> Propostes
          </button>
        )}
      </div>

      <main id="library-main">
        {tab === "canconers" && <CanconersTab />}
        {tab === "proposals" && !isAdmin && <ProposalsTab />}
      </main>

      <ToastHost />
    </>
  )
}
