import type { CSSProperties } from "react"
import { notFound } from "next/navigation"
import { getCanconerByToken } from "@/db/queries/canconers"
import { SharedIndex } from "@/components/shared/SharedIndex"
import { SharedPdfButton } from "@/components/shared/SharedPdfButton"
import { SongView } from "@/components/song/SongView"

interface Props {
  params: Promise<{ token: string }>
}

function resolveLinkUrl(
  platform: "none" | "youtube" | "spotify",
  yt: string | null,
  sp: string | null,
): string | null {
  if (platform === "none") return null
  if (platform === "youtube") return yt ?? sp ?? null
  return sp ?? yt ?? null
}

export default async function SharedPage({ params }: Props) {
  const { token } = await params
  const canconer = await getCanconerByToken(token)
  if (!canconer) notFound()

  const songIds = canconer.songs.map((s) => `song-${s.id}`)
  const songTitles = canconer.songs.map((s) => s.title)

  const style = canconer.style ?? "classic"
  const accentColor = canconer.accent_color ?? null
  const inlineStyle = accentColor
    ? ({ "--accent": accentColor } as CSSProperties)
    : undefined

  const linkPlatform = canconer.pdf_options?.link_platform ?? "none"
  const showQr = canconer.pdf_options?.show_qr ?? false

  return (
    <>
      <header data-style={style} style={inlineStyle}>
        <a href="/" className="back-link">
          ← Cançoner
        </a>
        <h1 id="shared-title">{canconer.title}</h1>
        <p className="subtitle" id="shared-meta">
          Per {canconer.owner_name} · {canconer.songs.length} cançons
        </p>
        <SharedPdfButton
          title={canconer.title}
          style={style}
          accentColor={accentColor}
          pdfOptions={canconer.pdf_options ?? null}
          songs={canconer.songs.map((s) => ({ id: s.id, semitones: s.semitones }))}
        />
      </header>
      <div id="shared-layout" data-style={style} style={inlineStyle}>
        <nav id="shared-nav">
          <h2>Índex</h2>
          <SharedIndex ids={songIds} titles={songTitles} />
        </nav>
        <main id="shared-songs">
          {canconer.songs.map((s, i) => {
            const linkUrl = resolveLinkUrl(linkPlatform, s.youtube_url, s.spotify_url)
            return (
              <SongView
                key={s.id}
                id={`song-${s.id}`}
                song={s}
                semitones={s.semitones}
                number={i + 1}
                styleVariant={style}
                accentColor={accentColor}
                titleLinkUrl={linkUrl}
                qrUrl={showQr ? linkUrl : null}
              />
            )
          })}
        </main>
      </div>
    </>
  )
}
