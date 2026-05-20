"use client"
import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useUiStore } from "@/hooks/useUi"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { SongList } from "./SongList"
import { CanconerPanel } from "./CanconerPanel"
import { DetailPanel } from "./DetailPanel"
import { KeyMenu } from "./KeyMenu"
import { OverwriteToast } from "./OverwriteToast"
import { ProposeLoginToast } from "./ProposeLoginToast"
import { NewSongButton } from "./NewSongButton"
import type { CanconerListItem, CanconerStyle } from "@/types/song"
import type { Song } from "@/types/song"

export function SongbookEditor() {
  const { data: session } = useSession()
  const loadSongs = useSongbookStore((s) => s.loadSongs)
  const loadExistingCanconer = useSongbookStore((s) => s.loadExistingCanconer)
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)
  const previewActive = useSongbookStore((s) => s.previewActive)

  useEffect(() => {
    loadSongs()

    // Try to load a cançoner from sessionStorage
    const raw = sessionStorage.getItem("load_canconer")
    if (raw) {
      sessionStorage.removeItem("load_canconer")
      void loadFromSession(raw)
    } else if (session?.user?.active) {
      void setDefaultTitle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When session becomes available and no sessionStorage load, set default title
  useEffect(() => {
    const raw = sessionStorage.getItem("load_canconer")
    if (!raw && session?.user?.active) {
      void setDefaultTitle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function loadFromSession(raw: string) {
    try {
      const data = JSON.parse(raw) as {
        id: number
        title: string
        style?: CanconerStyle
        accent_color?: string | null
        songs: Array<{ id: number; semitones: number }>
      }
      const entries = await Promise.all(
        data.songs.map(async ({ id, semitones }) => {
          const res = await fetch(`/api/songs/${id}`)
          const song = (await res.json()) as Song
          return { song, semitones }
        }),
      )
      loadExistingCanconer({
        id: data.id,
        title: data.title,
        style: data.style ?? "classic",
        accentColor: data.accent_color ?? null,
        entries,
      })
    } catch {
      // Ignore parse/fetch errors
    }
  }

  async function setDefaultTitle() {
    try {
      const res = await fetch("/api/canconers")
      if (!res.ok) return
      const list = (await res.json()) as CanconerListItem[]
      const titles = new Set(list.map((c) => c.title.toLowerCase()))

      let candidate = "El meu cançoner"
      let n = 2
      while (titles.has(candidate.toLowerCase())) {
        candidate = `El meu cançoner ${n}`
        n++
      }
      setCanconerTitle(candidate)
    } catch {
      // Ignore errors
    }
  }

  return (
    <>
      <header>
        <h1>🎵 Cançoner</h1>
        <p className="subtitle">Tria les cançons i genera el teu PDF</p>
        <div className="header-actions">
          <NewSongButton />
          <UserWidget />
        </div>
      </header>
      <main id="main-layout" className={!previewActive ? "no-preview" : ""}>
        <SongList />
        <CanconerPanel />
        <DetailPanel />
      </main>
      <KeyMenu />
      <OverwriteToast />
      <ProposeLoginToast />
      <ToastHost />
    </>
  )
}
