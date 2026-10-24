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
import { useUiStore } from "@/hooks/useUi"
import { UserWidget } from "@/components/UserWidget"
import { ToastHost } from "@/components/Toast"
import { SongList } from "./SongList"
import { CanconerPanel } from "./CanconerPanel"
import { DetailPanel, PreviewToggleButton } from "./DetailPanel"
import { KeyMenu } from "./KeyMenu"
import { QuickArrangeDialog } from "./arrange/QuickArrangeDialog"
import { OverwriteToast } from "./OverwriteToast"
import { ProposeLoginToast } from "./ProposeLoginToast"
import { NewSongButton } from "./NewSongButton"
import { ResizeHandles } from "./ResizeHandles"
import { AppHeader } from "./AppHeader"
import { StartOverlay, type LoadCanconerPayload } from "./start/StartOverlay"
import { getT } from "@/lib/i18n"
import type { CSSProperties } from "react"
import type { CanconerEntry, CanconerListItem, CanconerSongRef, CanconerStyle } from "@/types/song"
import { songRefs } from "@/lib/canconerApi"
import { pdfOptionsSchema, PDF_OPTIONS_DEFAULTS, type PdfOptions } from "@/lib/schemas/canconer"
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
  songs: CanconerSongRef[]
}

export function SongbookEditor() {
  const t = getT()
  const { data: session } = useSession()
  const loadSongs = useSongbookStore((s) => s.loadSongs)
  const loadExistingCanconer = useSongbookStore((s) => s.loadExistingCanconer)
  const setProvisionalTitle = useSongbookStore((s) => s.setProvisionalTitle)
  const previewActive = useSongbookStore((s) => s.previewActive)
  const startOverlayOpen = useUiStore((s) => s.startOverlayOpen)
  const setStartOverlay = useUiStore((s) => s.setStartOverlay)
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
    // 2) "start_with_song" (one-shot des de /songs/[artist]/[song] o de la
    //    Biblioteca). Amb `append: true`, s'afegeix al cançoner en curs.
    // 3) "canconer_in_progress" (autoguardat de sessió anterior).
    // 4) Estat per defecte, amb títol generat segons cançoners existents.
    //    Amb sessió, l'overlay d'inici demana obrir o crear un cançoner.
    // El store sobreviu a la navegació: l'overlay es decideix a cada muntatge.
    setStartOverlay(false)

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
      const inProgress = sessionStorage.getItem(IN_PROGRESS_STORAGE_KEY)
      const append = isAppend(startRaw) && inProgress !== null
      if (!append) sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
      void (async () => {
        if (append) await hydrateInProgress(inProgress)
        await startWithSong(startRaw, append)
      })().finally(() => {
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
    setStartOverlay(true)
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
      songs: songRefs(s.canconer),
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
        data.songs.map(async ({ id, semitones, arrangement }): Promise<CanconerEntry | null> => {
          const res = await fetch(`/api/songs/${id}`)
          if (!res.ok) return null
          const song = (await res.json()) as Song
          return { song, semitones, arrangement: arrangement ?? null }
        }),
      )
      const validEntries = entries.filter(
        (e): e is CanconerEntry => e !== null,
      )
      // Reutilitzem loadExistingCanconer per restaurar tots els camps de cop.
      // Si savedCanconerId era null, passem -1 i tot seguit el reposem a null.
      useSongbookStore.setState({
        savedCanconerId: data.savedCanconerId,
        canconerTitle: data.canconerTitle,
        provisionalTitle: data.canconerTitle,
        canconerStyle: data.canconerStyle,
        accentColor: data.accentColor,
        pdfOptions: pdfOptionsSchema.safeParse(data.pdfOptions ?? {}).data ?? PDF_OPTIONS_DEFAULTS,
        previewActive: data.previewActive,
        canconer: validEntries,
        selectedIdx: validEntries.length > 0 ? 0 : null,
      })
    } catch {
      // Si la hidratació falla, esborra la clau corrupta
      sessionStorage.removeItem(IN_PROGRESS_STORAGE_KEY)
    }
  }

  function isAppend(raw: string): boolean {
    try {
      return (JSON.parse(raw) as { append?: unknown }).append === true
    } catch {
      return false
    }
  }

  async function startWithSong(raw: string, append = false) {
    try {
      const data = JSON.parse(raw) as { songId: number; semitones?: number }
      if (typeof data.songId !== "number") return
      const res = await fetch(`/api/songs/${data.songId}`)
      if (!res.ok) return
      const song = (await res.json()) as Song
      if (append) {
        const { canconer } = useSongbookStore.getState()
        const next = [...canconer, { song, semitones: data.semitones ?? 0 }]
        useSongbookStore.setState({ canconer: next, selectedIdx: next.length - 1, previewActive: true })
        return
      }
      useSongbookStore.setState({
        savedCanconerId: null,
        canconer: [{ song, semitones: data.semitones ?? 0 }],
        selectedIdx: 0,
        // Ja hi ha una cançó: obre la vista prèvia.
        previewActive: true,
      })
    } catch {
      // Ignora errors de parse/fetch — quedarà l'estat per defecte.
    }
  }

  async function loadFromSession(raw: string) {
    try {
      await loadCanconerPayload(JSON.parse(raw) as LoadCanconerPayload)
    } catch {
      // Ignore parse/fetch errors
    }
  }

  /** Carrega un cançoner a l'editor (de la Biblioteca, del visor públic o
   *  de l'overlay d'inici). Llança si alguna petició falla. */
  async function loadCanconerPayload(data: LoadCanconerPayload) {
    // `id` absent: és una còpia d'un cançoner d'algú altre (visor públic),
    // que es desarà com a cançoner nou. Les cançons que no es poden veure
    // fora d'aquell cançoner (privades de l'autor) no s'hi copien.
    const entries = (
      await Promise.all(
        data.songs.map(async ({ id, semitones, arrangement }): Promise<CanconerEntry | null> => {
          const res = await fetch(`/api/songs/${id}`)
          if (!res.ok) return null
          const song = (await res.json()) as Song
          return { song, semitones, arrangement: arrangement ?? null }
        }),
      )
    ).filter((e): e is CanconerEntry => e !== null)
    loadExistingCanconer({
      id: data.id ?? -1,
      title: data.title,
      style: data.style ?? "classic",
      accentColor: data.accent_color ?? null,
      pdfOptions: data.pdf_options ?? null,
      entries,
    })
    if (data.id === undefined) useSongbookStore.setState({ savedCanconerId: null })
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
      setProvisionalTitle(candidate)
    } catch {
      // Ignore errors
    }
  }

  return (
    <>
      <AppHeader
        subtitle={t.app.songbook.editor.titol}
        actions={
          <>
            <NewSongButton />
            <UserWidget />
          </>
        }
      />
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
      <QuickArrangeDialog />
      <OverwriteToast />
      <ProposeLoginToast />
      {startOverlayOpen && session?.user?.active && (
        <StartOverlay onLoad={loadCanconerPayload} />
      )}
      <ToastHost />
    </>
  )
}
