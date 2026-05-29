"use client"
import { useSession } from "next-auth/react"
import { useUiStore } from "@/hooks/useUi"

export function NewSongButton() {
  const { data: session, status } = useSession()
  const setProposeLogin = useUiStore((s) => s.setProposeLogin)

  if (status === "loading") return null

  const user = session?.user?.active ? session.user : null
  const isAdmin = user?.role === "admin"

  if (!user) {
    return (
      <button
        id="btn-new-song"
        className="btn-new-song"
        onClick={() => setProposeLogin(true)}
      >
        + Proposa una cançó
      </button>
    )
  }

  if (isAdmin) {
    return (
      <a id="btn-new-song" className="btn-new-song" href="/app/editor">
        + Nova cançó
      </a>
    )
  }

  return (
    <a id="btn-new-song" className="btn-new-song" href="/app/editor">
      + Proposa una cançó
    </a>
  )
}
