"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn, useSession } from "next-auth/react"
import { guardMobileApp } from "@/components/public/MobileGateLink"
import { getT } from "@/lib/i18n"
import { IconGitBranch, IconLock, IconPencil } from "@/components/shared/Icons"
import { PublicSongCard, type PublicSongData } from "./PublicSongCard"
import { SongControlsBar } from "./SongControlsBar"
import { useReaderControls } from "./useReaderControls"

interface Props {
  song: PublicSongData
  /**
   * Cançó privada (visor /songs/private/[id]): en lloc de "Fes-ne la teva
   * versió" hi ha "Edita", i una línia amb el tipus i l'original.
   */
  privateInfo?: {
    kind: "private" | "arrangement" | "proposal"
    original: { title: string; href: string | null } | null
    canEdit: boolean
  }
}

/**
 * PublicSongView — vista pública interactiva d'una cançó.
 *
 * Layout principal: targeta blanca centrada amb la capçalera (títol, artista
 * clicable, tonalitat clicable que obre KeyPicker i CTA per crear cançoner) i
 * a sota el body de la cançó.
 *
 * Controls (transposició, mida i autoscroll) en barra flotant a baix de tot.
 */
export function PublicSongView({ song, privateInfo }: Props) {
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

  return (
    <div
      className="public-song-page"
      style={{ ["--song-font-size" as string]: `${controls.fontSize}px` }}
    >
      <main className="public-song-main">
        <PublicSongCard
          song={song}
          semitones={semitones}
          flats={controls.flats}
          onSemitonesChange={setSemitones}
          extraLine={extraLine}
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
        </div>
      </main>

      <SongControlsBar
        controls={controls}
        semitones={semitones}
        onSemitonesChange={setSemitones}
      />
    </div>
  )
}
