"use client"
import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import { guardMobileApp } from "@/components/public/MobileGateLink"
import { getT } from "@/lib/i18n"
import { IconGitBranch, IconLock, IconPencil } from "@/components/shared/Icons"
import { SongbookCard, type SongbookCardData } from "@/components/public/SongbookCard"
import { PublicSongCard, type PublicSongData } from "./PublicSongCard"
import { SongControlsBar } from "./SongControlsBar"
import { useReaderControls } from "./useReaderControls"
import { youtubeVideoId } from "@/lib/youtube"
import { PlayerProvider, usePlayerOptional } from "@/components/player/PlayerProvider"
import { PlayerButton, PlayerPanel, PlayerStrip, usePlayerAllowed } from "@/components/player/PlayerPanel"
import { SyncedSongBody } from "@/components/player/SyncedSongBody"

/** Les cançons públiques es poden reportar des de la seva pàgina. */
const REPORT_FROM_SONG = { source: "song" } as const

interface Props {
  song: PublicSongData & { rhythm?: string | null }
  /**
   * Cançó privada (visor /songs/private/[id]): en lloc de "Fes-ne la teva
   * versió" hi ha "Edita", i una línia amb el tipus i l'original.
   */
  privateInfo?: {
    kind: "private" | "arrangement" | "proposal"
    original: { title: string; href: string | null } | null
    canEdit: boolean
  }
  /** Cançoners públics populars que la contenen (sota els CTA). */
  songbooks?: Array<SongbookCardData & { from_song_id: number }>
  /**
   * Reproductor «Toca-la»: la cançó té una anàlisi vigent amb aquesta qualitat de
   * sincronització (null = no en té). Amb `ok: false` només el veuen els admins.
   */
  player?: { ok: boolean } | null
}

/**
 * PublicSongView — vista pública interactiva d'una cançó.
 *
 * Layout principal: targeta blanca centrada amb la capçalera (títol, artista
 * clicable, tonalitat clicable que obre KeyPicker i CTA per crear cançoner) i
 * a sota el body de la cançó.
 *
 * Controls (transposició, mida i autoscroll) en barra flotant a baix de tot. Si la cançó té
 * una sincronització prou bona, el primer botó de la barra obre el reproductor «Toca-la»
 * (src/components/player/): columna a la dreta de la targeta i cos que segueix la cançó.
 */
export function PublicSongView({ song, privateInfo, songbooks = [], player = null }: Props) {
  const t = getT()
  const router = useRouter()
  const { status } = useSession()
  const controls = useReaderControls()
  const [semitones, setSemitones] = useState(0)

  function startCanconerWithThisSong() {
    if (guardMobileApp()) return
    sessionStorage.setItem(
      "start_with_song",
      JSON.stringify({ songId: song.id, semitones }),
    )
    router.push("/app")
  }

  /** Obre l'editor: si és pública i no ets admin, hi desaràs la teva versió (arranjament). */
  function editInEditor() {
    if (guardMobileApp()) return
    const href = `/app/editor?id=${song.id}`
    if (status !== "authenticated") {
      void signIn("google", { callbackUrl: href })
      return
    }
    router.push(href)
  }

  const extraLine = privateInfo ? (
    <>
      {privateInfo.kind === "arrangement" ? <IconGitBranch /> : <IconLock />}{" "}
      {privateInfo.kind === "arrangement" && privateInfo.original ? (
        <>
          {t.public.publicSong.arranjamentDe}{" "}
          {privateInfo.original.href ? (
            <Link href={privateInfo.original.href}>{privateInfo.original.title}</Link>
          ) : (
            privateInfo.original.title
          )}
          {" · "}
          {t.public.publicSong.nomesTu}
        </>
      ) : privateInfo.kind === "proposal" ? (
        t.public.publicSong.propostaPendent
      ) : (
        t.public.publicSong.cancoPrivada
      )}
    </>
  ) : undefined

  const { allowed: playerAllowed, warn: playerWarn } = usePlayerAllowed(player)
  const playerSong = useMemo(
    () => ({
      id: song.id,
      content: song.content,
      youtubeId: song.youtube_url ? youtubeVideoId(song.youtube_url) : null,
      capo: song.capo ?? 0,
      rhythm: song.rhythm ?? null,
    }),
    [song.id, song.content, song.youtube_url, song.capo, song.rhythm],
  )

  const page = (
    <PlayerLayout
      enabled={playerAllowed}
      warn={playerWarn}
      fontSize={controls.fontSize}
      bar={
        <SongControlsBar
          controls={controls}
          semitones={semitones}
          onSemitonesChange={setSemitones}
        >
          {playerAllowed && <PlayerButton />}
        </SongControlsBar>
      }
      body={(open) =>
        open ? <SyncedSongBody content={song.content} semitones={semitones} flats={controls.flats} /> : undefined
      }
    >
      {(syncedBody) => (
        <>
          <PublicSongCard
            song={song}
            semitones={semitones}
            flats={controls.flats}
            onSemitonesChange={setSemitones}
            extraLine={extraLine}
            report={privateInfo ? undefined : REPORT_FROM_SONG}
            onReportOpen={controls.stopAutoscroll}
            body={syncedBody}
            headerActions={
              <button
                type="button"
                className="public-song-header-cta"
                onClick={startCanconerWithThisSong}
              >
                {t.public.publicSong.comencaCanconerCta}
              </button>
            }
          />

          <div className="public-song-cta-wrap">
            <button
              type="button"
              className="public-song-cta"
              onClick={startCanconerWithThisSong}
            >
              {t.public.publicSong.comencaCanconerCtaLlarg}
            </button>
            <p className="public-song-cta-hint">
              {t.public.publicSong.comencaCanconerHint}
            </p>
            {(!privateInfo || privateInfo.canEdit) && (
              <button type="button" className="public-song-secondary-cta" onClick={editInEditor}>
                <IconPencil />{" "}
                {privateInfo ? t.public.publicSong.editar : t.public.publicSong.fesLaTevaVersio}
              </button>
            )}
            {!privateInfo && (
              <p className="public-song-cta-hint">{t.public.publicSong.fesLaTevaVersioHint}</p>
            )}
            {songbooks.length > 0 && (
              <div className="public-song-songbooks">
                <h2 className="public-song-songbooks-title">{t.public.publicSong.canconersAmbAquesta}</h2>
                <ul className="public-song-songbooks-list">
                  {songbooks.map((s) => (
                    <li key={s.id}>
                      <SongbookCard songbook={s} fromSongId={s.from_song_id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </PlayerLayout>
  )

  if (!playerAllowed) return page
  return (
    <PlayerProvider song={playerSong} semitones={semitones} flats={controls.flats} onOpen={controls.stopAutoscroll}>
      {page}
    </PlayerProvider>
  )
}

/**
 * Pàgina amb el reproductor opcional: amb el reproductor obert, la columna del reproductor
 * (esquerra) i la targeta van en graella (escriptori) o la franja sobre la barra (pantalles
 * estretes), i el cos de la cançó passa a ser el sincronitzat.
 */
function PlayerLayout({
  enabled,
  warn,
  fontSize,
  bar,
  body,
  children,
}: {
  enabled: boolean
  warn: boolean
  fontSize: number
  bar: ReactNode
  body: (open: boolean) => ReactNode
  children: (syncedBody: ReactNode) => ReactNode
}) {
  const open = usePlayerOptional((s) => s.open && s.timeline !== null) ?? false
  const panelOpen = (usePlayerOptional((s) => s.open) ?? false) && enabled
  return (
    <div
      className={`public-song-page${panelOpen ? " has-player" : ""}`}
      style={{ ["--song-font-size" as string]: `${fontSize}px` }}
    >
      <main className="public-song-main">
        {panelOpen && <PlayerPanel warn={warn} />}
        <div className="public-song-col">{children(enabled ? body(open) : undefined)}</div>
      </main>
      {panelOpen && <PlayerStrip warn={warn} />}
      {bar}
    </div>
  )
}
