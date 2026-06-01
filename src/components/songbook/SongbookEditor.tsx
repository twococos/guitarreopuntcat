"use client"
import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  useSongbookStore,
  IN_PROGRESS_STORAGE_KEY,
  DEFAULT_CANCONER_TITLE,
  isDefaultCanconerTitle,
} from "@/hooks/useSongbook"
import { useColumnSizesStore } from "@/hooks/useColumnSizes"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { SongList } from "./SongList"
import { CanconerPanel } from "./CanconerPanel"
import { DetailPanel, PreviewToggleButton } from "./DetailPanel"
import { KeyMenu } from "./KeyMenu"
import { OverwriteToast } from "./OverwriteToast"
import { ProposeLoginToast } from "./ProposeLoginToast"
import { NewSongButton } from "./NewSongButton"
import { ResizeHandles } from "./ResizeHandles"
import { getT } from "@/lib/i18n"
import type { CSSProperties } from "react"
import type { CanconerListItem, CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"
import type { Song } from "@/types/song"

/* ── Forma serialitzada del cançoner en curs (sessionStorage) ─ */

interface InProgressPayload {
  v: 1
  savedCanconerId: number | null
  canconerTitle: string
  canconerStyle: CanconerStyle
  accentColor: string | null
  pdfOptions: PdfOptions
  previewActive: boolean
  songs: Array<{ id: number; semitones: number }>
}

export function SongbookEditor() {
  const t = getT()
  const { data: session } = useSession()
  const loadSongs = useSongbookStore((s) => s.loadSongs)
  const loadExistingCanconer = useSongbookStore((s) => s.loadExistingCanconer)
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)
  const previewActive = useSongbookStore((s) => s.previewActive)
  const leftWidth = useColumnSizesStore((s) => s.leftWidth)
  const rightWidth = useColumnSizesStore((s) => s.rightWidth)
  const hydrateColumnSizes = useColumnSizesStore((s) => s.hydrate)

  // Hidrata les amplades des de localStorage NOMÉS al client, després
  // del primer render, per evitar mismatch d'hidratació SSR↔client.
  useEffect(() => {
    hydrateColumnSizes()
  }, [hydrateColumnSizes])

  /** Flag que indica si la hidratació inicial ja ha acabat. Fins llavors
   *  no persistim canvis (per no escriure abans d'haver llegit). */
  const hydratedRef = useRef(false)

  useEffect(() => {
    loadSongs()

    // Prioritats de càrrega:
    // 1) "load_canconer" (one-shot des de /library) — màxima prioritat.
    // 2) "start_with_song" (one-shot des de /songs/[artist]/[song]).
    // 3) "canconer_in_progress" (autoguardat de sessió anterior).
    // 4) Estat per defecte, amb títol generat segons cançoners existents.
    const loadRaw = sessionStorage.getItem("load_canconer")
    if (loadRaw) {
      sessionStorage.removeItem("load_canconer")
      // En carregar un guardat, també esborrem el in-progress per evitar
      // sobreescriure'l immediatament amb el contingut del guardat.
      sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
      void loadFromSession(loadRaw).finally(() => {
        hydratedRef.current = true
      })
      return
    }

    const startRaw = sessionStorage.getItem("start_with_song")
    if (startRaw) {
      sessionStorage.removeItem("start_with_song")
      sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
      void startWithSong(startRaw).finally(() => {
        hydratedRef.current = true
      })
      return
    }

    const inProgressRaw = sessionStorage.getItem(IN_PROGRESS_STORAGE_KEY)
    if (inProgressRaw) {
      void hydrateInProgress(inProgressRaw).finally(() => {
        hydratedRef.current = true
      })
      return
    }

    if (session?.user?.active) {
      void setDefaultTitle()
    }
    hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quan canvia la sessió i no hi ha res a hidratar, recalcula el títol default.
  useEffect(() => {
    if (!hydratedRef.current) return
    const loadRaw = sessionStorage.getItem("load_canconer")
    const startRaw = sessionStorage.getItem("start_with_song")
    const inProgressRaw = sessionStorage.getItem(IN_PROGRESS_STORAGE_KEY)
    if (loadRaw || startRaw || inProgressRaw) return
    if (session?.user?.active) {
      void setDefaultTitle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  /* ── Autoguardat ─────────────────────────────────────────── */

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const unsub = useSongbookStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      // Detecta si algun dels camps persistits ha canviat
      if (
        state.canconer === prev.canconer &&
        state.canconerTitle === prev.canconerTitle &&
        state.canconerStyle === prev.canconerStyle &&
        state.accentColor === prev.accentColor &&
        state.pdfOptions === prev.pdfOptions &&
        state.previewActive === prev.previewActive &&
        state.savedCanconerId === prev.savedCanconerId
      ) {
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        persistInProgress()
      }, 300)
    })

    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [])

  function persistInProgress() {
    const s = useSongbookStore.getState()
    // Si està buit i no s'ha tocat res, esborrem la clau per no acumular brossa
    if (
      s.canconer.length === 0 &&
      isDefaultCanconerTitle(s.canconerTitle) &&
      s.canconerStyle === "classic" &&
      s.accentColor === null &&
      s.savedCanconerId === null
    ) {
      sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
      return
    }
    const payload: InProgressPayload = {
      v: 1,
      savedCanconerId: s.savedCanconerId,
      canconerTitle: s.canconerTitle,
      canconerStyle: s.canconerStyle,
      accentColor: s.accentColor,
      pdfOptions: s.pdfOptions,
      previewActive: s.previewActive,
      songs: s.canconer.map((e) => ({ id: e.song.id, semitones: e.semitones })),
    }
    try {
      sessionStorage.setItem(IN_PROGRESS_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // QuotaExceeded o sessionStorage no disponible: ignora
    }
  }

  async function hydrateInProgress(raw: string) {
    try {
      const data = JSON.parse(raw) as InProgressPayload
      if (data?.v !== 1) return
      const entries = await Promise.all(
        data.songs.map(async ({ id, semitones }) => {
          const res = await fetch(`/api/songs/${id}`)
          if (!res.ok) return null
          const song = (await res.json()) as Song
          return { song, semitones }
        }),
      )
      const validEntries = entries.filter(
        (e): e is { song: Song; semitones: number } => e !== null,
      )
      // Reutilitzem loadExistingCanconer per restaurar tots els camps de cop.
      // Si savedCanconerId era null, passem -1 i tot seguit el reposem a null.
      useSongbookStore.setState({
        savedCanconerId: data.savedCanconerId,
        canconerTitle: data.canconerTitle,
        canconerStyle: data.canconerStyle,
        accentColor: data.accentColor,
        pdfOptions: data.pdfOptions,
        previewActive: data.previewActive,
        canconer: validEntries,
        selectedIdx: validEntries.length > 0 ? 0 : null,
      })
    } catch {
      // Si la hidratació falla, esborra la clau corrupta
      sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
    }
  }

  async function startWithSong(raw: string) {
    try {
      const data = JSON.parse(raw) as { songId: number; semitones?: number }
      if (typeof data.songId !== "number") return
      const res = await fetch(`/api/songs/${data.songId}`)
      if (!res.ok) return
      const song = (await res.json()) as Song
      useSongbookStore.setState({
        savedCanconerId: null,
        canconer: [{ song, semitones: data.semitones ?? 0 }],
        selectedIdx: 0,
      })
    } catch {
      // Ignora errors de parse/fetch — quedarà l'estat per defecte.
    }
  }

  async function loadFromSession(raw: string) {
    try {
      const data = JSON.parse(raw) as {
        id: number
        title: string
        style?: CanconerStyle
        accent_color?: string | null
        pdf_options?: PdfOptions | null
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
        pdfOptions: data.pdf_options ?? null,
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

      let candidate = DEFAULT_CANCONER_TITLE
      let n = 2
      while (titles.has(candidate.toLowerCase())) {
        candidate = `${DEFAULT_CANCONER_TITLE} ${n}`
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
        <h1>🎵 {t.app.songbook.editor.titol}</h1>
        <p className="subtitle">{t.app.songbook.editor.subtitol}</p>
        <div className="header-actions">
          <NewSongButton />
          <UserWidget />
        </div>
      </header>
      <main
        id="main-layout"
        className={!previewActive ? "no-preview" : ""}
        style={
          {
            "--col-songs": `${leftWidth}px`,
            "--col-detail": `${rightWidth}%`,
          } as CSSProperties
        }
      >
        <SongList />
        <CanconerPanel />
        <DetailPanel />
        <ResizeHandles />
        <PreviewToggleButton />
      </main>
      <KeyMenu />
      <OverwriteToast />
      <ProposeLoginToast />
      <ToastHost />
    </>
  )
}
