"use client"
import { useSession } from "next-auth/react"
import { useUiStore } from "@/hooks/useUi"
import { getT } from "@/lib/i18n"

export function NewSongButton() {
  const t = getT()
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
        {t.app.songbook.newSongButton.proposaUnaCanco}
      </button>
    )
  }

  if (isAdmin) {
    return (
      <a id="btn-new-song" className="btn-new-song" href="/app/editor">
        {t.app.songbook.newSongButton.novaCanco}
      </a>
    )
  }

  return (
    <a id="btn-new-song" className="btn-new-song" href="/app/editor">
      {t.app.songbook.newSongButton.proposaUnaCanco}
    </a>
  )
}
