"use client"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getT } from "@/lib/i18n"
import { SONG_STATE } from "@/lib/songKind"
import { useToastStore } from "@/hooks/useToasts"
import { usePdfProgress } from "@/hooks/usePdfProgress"
import { requestPdf, downloadBlob } from "@/lib/pdf-client/request"
import { pdfOptionsSchema, type CanconerStyle, type PdfOptions } from "@/lib/schemas/canconer"
import type { PdfSong } from "@/lib/pdf-client/types"
import type { OptionsSourceValue } from "@/components/songbook/options/OptionsSource"
import { PdfExportDialog } from "./PdfExportDialog"
import { transposeKey, respellAccidentals, ALL_FLATS, ALL_SHARPS } from "@/lib/transpose"
import { guardMobileApp } from "@/components/public/MobileGateLink"
import { PdfProgressOverlay } from "@/components/shared/PdfProgressOverlay"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCopy,
  IconGitBranch,
  IconFileText,
  IconList,
  IconLock,
  IconOpen,
} from "@/components/shared/Icons"
import { PublicSongCard, type PublicSongData } from "@/components/songs/PublicSongCard"
import { SongControlsBar } from "@/components/songs/SongControlsBar"
import { useReaderControls } from "@/components/songs/useReaderControls"
import type { ReportContext } from "@/components/reports/useSongReport"
import type { QuickArrangement } from "@/lib/schemas/arrangement"
import { applyArrangement } from "@/lib/arrangement/apply"
import { youtubeVideoId } from "@/lib/youtube"
import { PlayerProvider, usePlayer, type PlayerSong } from "@/components/player/PlayerProvider"
import { PlayerButton, PlayerPanel, PlayerStrip, usePlayerAllowed } from "@/components/player/PlayerPanel"
import { SyncedSongBody } from "@/components/player/SyncedSongBody"

export interface SongbookViewerSong extends PublicSongData {
  state: number
  semitones: number
  /** Arranjament ràpid del cançoner (§22). */
  arrangement?: QuickArrangement | null
  /** Estil d'acompanyament fixat per l'admin (reproductor). */
  rhythm?: string | null
  youtube_url: string | null
  spotify_url: string | null
}

export interface SongbookViewerData {
  id: number
  title: string
  owner_name: string
  style: CanconerStyle
  accent_color: string | null
  pdf_options: PdfOptions | null
  songs: SongbookViewerSong[]
}

interface Props {
  songbook: SongbookViewerData
  /** Context per al PDF (fa visibles les privades del cançoner). */
  pdfContext: { songbook_id: number } | { share_token: string } | null
  /** Cançó inicial (índex 0-based, de ?song=N o ?from=ID). */
  initialIndex: number
  /** Previsualització del propietari: marca les privades i "Edita" en lloc de "Copia". */
  ownerPreview?: boolean
  backLink?: { href: string; label: string }
  /** Reproductor «Toca-la» per cançó pública: qualitat de la sincronització (null = sense anàlisi). */
  players?: Record<number, { ok: boolean } | null>
}

/**
 * Visor de cançoners de l'àrea pública: índex a l'esquerra, una cançó cada
 * vegada amb els controls de la pàgina de cançó (to per cançó, notació,
 * mida, autoscroll) i PDF al navegador. El fan servir /songbooks/[id]/[slug],
 * /c/[token] i la previsualització de la biblioteca.
 */
export function SongbookViewer({ songbook, pdfContext, initialIndex, ownerPreview = false, backLink, players = {} }: Props) {
  const t = getT()
  const tv = t.public.songbookViewer
  const router = useRouter()
  const controls = useReaderControls()
  const { stopAutoscroll } = controls
  const pdfProgress = usePdfProgress()
  const songs = songbook.songs
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, songs.length - 1)))
  // To de cada cançó: parteix del que té al cançoner i es recorda durant la visita
  const [semitones, setSemitones] = useState<number[]>(() => songs.map((s) => s.semitones ?? 0))
  const [indexOpen, setIndexOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  // Opcions del PDF: parteixen de les de l'autor i duren tota la visita
  // (tancar i reobrir el diàleg les conserva; «Copia i edita'l» se les emporta).
  const [pdfOptions, setPdfOptions] = useState<PdfOptions>(() => pdfOptionsSchema.parse(songbook.pdf_options ?? {}))
  const [pdfStyle, setPdfStyle] = useState<CanconerStyle>(songbook.style)
  const [pdfAccent, setPdfAccent] = useState<string | null>(songbook.accent_color)
  const optionsSource = useMemo<OptionsSourceValue>(
    () => ({
      pdfOptions,
      setPdfOption: (key, value) => setPdfOptions((prev) => ({ ...prev, [key]: value })),
      style: pdfStyle,
      setStyle: setPdfStyle,
      accentColor: pdfAccent,
      setAccentColor: setPdfAccent,
    }),
    [pdfOptions, pdfStyle, pdfAccent],
  )
  // Cançons de la prèvia, amb el to triat a cada una
  const pdfSongs = useMemo<PdfSong[]>(
    () =>
      songs.map((s, i) => ({
        title: s.title,
        artist: s.artist,
        key: s.key,
        capo: s.capo ?? null,
        content: applyArrangement(s.content, s.arrangement),
        semitones: semitones[i] ?? 0,
        album: s.album,
        year: s.year,
        youtubeUrl: s.youtube_url,
        spotifyUrl: s.spotify_url,
      })),
    [songs, semitones],
  )

  const song = songs[index]
  const notation = controls.flats ? ALL_FLATS : ALL_SHARPS

  // Les cançons públiques es poden reportar; el report recorda des de quin cançoner
  const reportContext = useMemo<ReportContext>(
    () =>
      !pdfContext
        ? { source: "song" }
        : "share_token" in pdfContext
          ? { source: "share", token: pdfContext.share_token }
          : { source: "songbook", songbook_id: pdfContext.songbook_id },
    [pdfContext],
  )

  const goTo = useCallback(
    (next: number, push = true) => {
      if (next < 0 || next >= songs.length) return
      setIndex(next)
      setIndexOpen(false)
      stopAutoscroll()
      if (push) {
        const url = new URL(window.location.href)
        url.searchParams.set("song", String(next + 1))
        window.history.pushState({ songbookSong: next }, "", url)
      }
      const top = mainRef.current ? mainRef.current.getBoundingClientRect().top + window.scrollY - 80 : 0
      if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" })
    },
    [songs.length, stopAutoscroll],
  )

  // ?from=ID (enllaços des d'una cançó o un artista) → URL canònica ?song=N
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("from")) return
    url.searchParams.delete("from")
    url.searchParams.set("song", String(index + 1))
    window.history.replaceState(window.history.state, "", url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Botó enrere/endavant del navegador
  useEffect(() => {
    function onPop() {
      const n = Number(new URL(window.location.href).searchParams.get("song"))
      const next = Number.isInteger(n) && n >= 1 ? n - 1 : 0
      if (next < songs.length) {
        setIndex(next)
        stopAutoscroll()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [songs.length, stopAutoscroll])

  // ←/→ canvien de cançó (fora de camps de text)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
      if (e.key === "ArrowLeft") goTo(index - 1)
      else if (e.key === "ArrowRight") goTo(index + 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [goTo, index])

  function setSongSemitones(s: number) {
    setSemitones((prev) => prev.map((v, i) => (i === index ? s : v)))
  }

  async function downloadPdf() {
    if (pdfProgress.active || songs.length === 0) return
    pdfProgress.start(t.common.pdfProgress.missatges)
    try {
      const blob = await requestPdf(
        {
          title: songbook.title,
          style: pdfStyle,
          accentColor: pdfAccent,
          options: pdfOptions,
          songs: songs.map((s, i) => ({ id: s.id, semitones: semitones[i] ?? 0, arrangement: s.arrangement ?? null })),
          ...(pdfContext ? { context: pdfContext } : {}),
        },
        pdfProgress.report,
      )
      await pdfProgress.finish()
      downloadBlob(blob, `${songbook.title}.pdf`)
      setPdfDialogOpen(false)
    } catch (err) {
      console.error("Error generant el PDF:", err)
      pdfProgress.fail()
      useToastStore.getState().show(t.public.sharedView.errorGenerantPdf, { type: "error" })
    }
  }

  /** Obre el cançoner a /app: el propietari l'edita; la resta, en fa una còpia. */
  function openInEditor() {
    if (guardMobileApp()) return
    sessionStorage.setItem(
      "load_canconer",
      JSON.stringify({
        ...(ownerPreview ? { id: songbook.id } : {}),
        title: songbook.title,
        style: pdfStyle,
        accent_color: pdfAccent,
        pdf_options: pdfOptions,
        songs: songs.map((s, i) => ({ id: s.id, semitones: semitones[i] ?? 0, arrangement: s.arrangement ?? null })),
      }),
    )
    if (!ownerPreview && songs.some((s) => s.state !== 0)) {
      useToastStore.getState().show(tv.copiaSensePrivades)
    }
    router.push("/app")
  }

  const closePdfDialog = useCallback(() => setPdfDialogOpen(false), [])

  const songHref = (s: SongbookViewerSong) =>
    s.state === 0 && s.artist_slug && s.song_slug ? `/songs/${s.artist_slug}/${s.song_slug}` : null

  // Reproductor «Toca-la»: cançons públiques amb sincronització (com a la pàgina de la cançó).
  // Amb arranjament ràpid (§22), sona i es veu l'arranjament.
  const { allowed: playerAllowed, warn: playerWarn } = usePlayerAllowed(
    song && song.state === SONG_STATE.PUBLIC ? (players[song.id] ?? null) : null,
  )
  const displayContent = useMemo(() => (song ? applyArrangement(song.content, song.arrangement) : ""), [song])
  const playerSong = useMemo<PlayerSong | null>(
    () =>
      song
        ? {
            id: song.id,
            content: song.content,
            youtubeId: song.youtube_url ? youtubeVideoId(song.youtube_url) : null,
            capo: song.capo ?? 0,
            rhythm: song.rhythm ?? null,
            arrangement: song.arrangement ?? null,
          }
        : null,
    [song],
  )

  const rootStyle: CSSProperties = {
    ["--song-font-size" as string]: `${controls.fontSize}px`,
    ...(songbook.accent_color ? { ["--songbook-accent" as string]: songbook.accent_color } : {}),
  }

  const header = (
    <header className="songbook-viewer-banner">
      <div className="songbook-viewer-header">
        <div className="songbook-viewer-header-main">
          {backLink && (
            <Link href={backLink.href} className="songbook-viewer-back">
              {backLink.label}
            </Link>
          )}
          <p className="songbook-viewer-eyebrow">{tv.canconer}</p>
          <h1 className="songbook-viewer-title">{songbook.title}</h1>
          <p className="songbook-viewer-meta">
            {tv.perAutor(songbook.owner_name)} · {t.public.sharedView.cancons(songs.length)}
          </p>
        </div>
        <div className="songbook-viewer-actions">
          <button
            type="button"
            className="songbook-viewer-btn songbook-viewer-btn--primary"
            onClick={() => setPdfDialogOpen(true)}
            disabled={songs.length === 0}
          >
            <IconFileText /> {t.public.sharedView.descarregarPdf}
          </button>
          <button type="button" className="songbook-viewer-btn" onClick={openInEditor} title={ownerPreview ? undefined : tv.copiarHint}>
            {ownerPreview ? <IconOpen /> : <IconCopy />} {ownerPreview ? tv.editar : tv.copiar}
          </button>
        </div>
      </div>
    </header>
  )

  const dialogs = (
    <>
      {pdfDialogOpen && (
        <PdfExportDialog
          title={songbook.title}
          songs={pdfSongs}
          options={optionsSource}
          downloading={pdfProgress.active}
          onDownload={() => void downloadPdf()}
          onClose={closePdfDialog}
        />
      )}

      <PdfProgressOverlay
        open={pdfProgress.active}
        pct={pdfProgress.pct}
        title={t.common.pdfProgress.titol}
        message={pdfProgress.message}
      />
    </>
  )

  if (songs.length === 0 || !song || !playerSong) {
    return (
      <div className="songbook-viewer" style={rootStyle}>
        {header}
        <p className="songbook-viewer-empty">{tv.buit}</p>
        {dialogs}
      </div>
    )
  }

  /**
   * Índex. Amb el reproductor obert (escriptori) es pot plegar: en queda només la cançó actual
   * (anterior/següent ja són a la barra de controls).
   */
  const renderIndex = (foldable: boolean, folded: boolean, onFold: () => void) => (
    <aside
      className={`songbook-viewer-index${indexOpen ? " is-open" : ""}${foldable ? " is-foldable" : ""}${folded ? " is-folded" : ""}`}
      aria-label={t.public.sharedView.index}
    >
      <button
        type="button"
        className="songbook-viewer-index-toggle"
        onClick={() => setIndexOpen((v) => !v)}
        aria-expanded={indexOpen}
      >
        <IconList /> <span>{tv.cancoNdeM(index + 1, songs.length)}</span>
        <span className="songbook-viewer-index-current">{song.title}</span>
      </button>
      {foldable && (
        <div className="songbook-viewer-index-head">
          <span className="songbook-viewer-index-num">{index + 1}</span>
          <span className="songbook-viewer-index-text">
            <span className="songbook-viewer-index-title">{song.title}</span>
            <span className="songbook-viewer-index-artist">{song.artist}</span>
          </span>
          <button
            type="button"
            className="player-icon-btn"
            onClick={onFold}
            aria-expanded={!folded}
            aria-label={folded ? tv.desplegaIndex : tv.plegaIndex}
            title={folded ? tv.desplegaIndex : tv.plegaIndex}
          >
            {folded ? <IconChevronDown /> : <IconChevronUp />}
          </button>
        </div>
      )}
      <ol className="songbook-viewer-index-list">
        {songs.map((s, i) => (
          <li key={`${s.id}-${i}`}>
            <button
              type="button"
              className={`songbook-viewer-index-item ${i === index ? "is-active" : ""}`}
              onClick={() => goTo(i)}
              aria-current={i === index ? "true" : undefined}
            >
              <span className="songbook-viewer-index-num">{i + 1}</span>
              <span className="songbook-viewer-index-text">
                <span className="songbook-viewer-index-title">
                  {s.title}
                  {ownerPreview && s.state !== 0 && (
                    <span className="songbook-viewer-private" title={tv.privadaTitle}>
                      <IconLock />
                    </span>
                  )}
                  {s.arrangement && (
                    <span className="songbook-viewer-private" title={tv.arranjamentTitle}>
                      <IconGitBranch />
                    </span>
                  )}
                </span>
                <span className="songbook-viewer-index-artist">{s.artist}</span>
              </span>
              <span className="songbook-viewer-index-key">
                {respellAccidentals(transposeKey(s.key, semitones[i] ?? 0), notation)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )

  const renderMain = (syncedBody: ReactNode) => (
    <>
      <PublicSongCard
        key={`${song.id}-${index}`}
        song={song}
        semitones={semitones[index] ?? 0}
        flats={controls.flats}
        onSemitonesChange={setSongSemitones}
        titleLevel={2}
        titleHref={songHref(song)}
        titlePrefix={<span className="songbook-viewer-song-num">{index + 1}</span>}
        report={song.state === SONG_STATE.PUBLIC ? reportContext : undefined}
        onReportOpen={stopAutoscroll}
        displayContent={displayContent}
        body={syncedBody}
        extraLine={
          song.arrangement ? (
            <span className="songbook-viewer-arranged" title={tv.arranjamentTitle}>
              <IconGitBranch /> {tv.arranjament}
            </span>
          ) : undefined
        }
      />
      <nav className="songbook-viewer-pager" aria-label={tv.navegacio}>
        {index > 0 ? (
          <button type="button" className="songbook-viewer-pager-btn" onClick={() => goTo(index - 1)}>
            <IconChevronLeft />
            <span>
              <small>{tv.anterior}</small>
              {songs[index - 1].title}
            </span>
          </button>
        ) : (
          <span />
        )}
        {index < songs.length - 1 && (
          <button
            type="button"
            className="songbook-viewer-pager-btn songbook-viewer-pager-btn--next"
            onClick={() => goTo(index + 1)}
          >
            <span>
              <small>{tv.seguent}</small>
              {songs[index + 1].title}
            </span>
            <IconChevronRight />
          </button>
        )}
      </nav>
    </>
  )

  const bar = (
    <SongControlsBar controls={controls} semitones={semitones[index] ?? 0} onSemitonesChange={setSongSemitones}>
      {playerAllowed && <PlayerButton />}
      <div className="public-song-bar-group" aria-label={tv.navegacio}>
        <button
          type="button"
          className="public-song-btn"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label={tv.anterior}
          title={`${tv.anterior} (←)`}
        >
          <IconChevronLeft />
        </button>
        <span className="songbook-viewer-bar-pos">
          {index + 1}/{songs.length}
        </span>
        <button
          type="button"
          className="public-song-btn"
          onClick={() => goTo(index + 1)}
          disabled={index >= songs.length - 1}
          aria-label={tv.seguent}
          title={`${tv.seguent} (→)`}
        >
          <IconChevronRight />
        </button>
      </div>
    </SongControlsBar>
  )

  return (
    <PlayerProvider song={playerSong} semitones={semitones[index] ?? 0} flats={controls.flats} onOpen={stopAutoscroll}>
      <ViewerFrame
        style={rootStyle}
        mainRef={mainRef}
        playerAllowed={playerAllowed}
        playerWarn={playerWarn}
        header={header}
        renderIndex={renderIndex}
        renderMain={renderMain}
        syncedBody={<SyncedSongBody content={displayContent} semitones={semitones[index] ?? 0} flats={controls.flats} />}
        bar={bar}
        dialogs={dialogs}
      />
    </PlayerProvider>
  )
}

/** Amb prou alçada, índex i reproductor poden estar desplegats alhora. */
const ROOMY_MIN_HEIGHT = 980
/** Per sota d'aquesta amplada l'índex va a sobre (mòbil) i la barra torna a centrar-se a la finestra. */
const SIDE_LAYOUT_MIN_WIDTH = 901

/**
 * Marc del visor dins el PlayerProvider: columna esquerra (índex + reproductor, tots dos
 * plegables), la cançó, la franja del reproductor (pantalles estretes) i la barra de controls,
 * centrada amb la cançó (no amb la finestra).
 *
 * Plegar una de les dues peces de la columna desplega l'altra. Desplegar-ne una plega l'altra
 * si no hi caben totes dues. En obrir el reproductor, l'índex es plega sol.
 */
function ViewerFrame({
  style,
  mainRef,
  playerAllowed,
  playerWarn,
  header,
  renderIndex,
  renderMain,
  syncedBody,
  bar,
  dialogs,
}: {
  style: CSSProperties
  mainRef: React.RefObject<HTMLElement | null>
  playerAllowed: boolean
  playerWarn: boolean
  header: ReactNode
  renderIndex: (foldable: boolean, folded: boolean, onFold: () => void) => ReactNode
  renderMain: (syncedBody: ReactNode) => ReactNode
  syncedBody: ReactNode
  bar: ReactNode
  dialogs: ReactNode
}) {
  const panelOpen = usePlayer((s) => s.open) && playerAllowed
  const ready = usePlayer((s) => s.open && s.timeline !== null) && playerAllowed
  const [indexExpanded, setIndexExpanded] = useState(true)
  const [playerExpanded, setPlayerExpanded] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIndexExpanded(!panelOpen)
    setPlayerExpanded(true)
  }, [panelOpen])

  const roomy = () => window.innerHeight >= ROOMY_MIN_HEIGHT
  function foldIndex() {
    if (indexExpanded) {
      setIndexExpanded(false)
      setPlayerExpanded(true)
    } else {
      setIndexExpanded(true)
      if (!roomy()) setPlayerExpanded(false)
    }
  }
  function foldPlayer() {
    if (playerExpanded) {
      setPlayerExpanded(false)
      setIndexExpanded(true)
    } else {
      setPlayerExpanded(true)
      if (!roomy()) setIndexExpanded(false)
    }
  }

  useBarOverMain(rootRef, mainRef)

  return (
    <div ref={rootRef} className={`songbook-viewer${panelOpen ? " has-player" : ""}`} style={style}>
      {header}
      <div className="songbook-viewer-layout">
        <div className="songbook-viewer-side">
          {renderIndex(panelOpen, panelOpen && !indexExpanded, foldIndex)}
          {panelOpen && <PlayerPanel warn={playerWarn} folded={!playerExpanded} onFold={foldPlayer} />}
        </div>
        <main className="songbook-viewer-main" ref={mainRef}>
          {renderMain(ready ? syncedBody : undefined)}
        </main>
      </div>
      {panelOpen && <PlayerStrip warn={playerWarn} />}
      {bar}
      {dialogs}
    </div>
  )
}

/**
 * La barra de controls (fixa) queda centrada amb la columna de la cançó, com a la pàgina de la
 * cançó amb el reproductor: les vores surten de la posició real de la columna.
 */
function useBarOverMain(rootRef: React.RefObject<HTMLElement | null>, mainRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    const main = mainRef.current
    if (!root || !main) return
    const update = () => {
      if (window.innerWidth < SIDE_LAYOUT_MIN_WIDTH) {
        root.style.removeProperty("--sbv-bar-left")
        root.style.removeProperty("--sbv-bar-right")
        return
      }
      const r = main.getBoundingClientRect()
      root.style.setProperty("--sbv-bar-left", `${Math.max(r.left, 0)}px`)
      root.style.setProperty("--sbv-bar-right", `${Math.max(document.documentElement.clientWidth - r.right, 0)}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(main)
    ro.observe(root)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [rootRef, mainRef])
}
