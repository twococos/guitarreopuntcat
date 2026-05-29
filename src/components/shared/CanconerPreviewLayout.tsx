import type { CSSProperties } from "react"
import { SharedIndex } from "@/components/shared/SharedIndex"
import { SharedPdfButton } from "@/components/shared/SharedPdfButton"
import { SongView } from "@/components/song/SongView"
import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"

// ─── Tipus compartits entre /c/[token] i /library/canconers/[id]/preview ───

export interface PreviewCanconerSong {
  id: number
  title: string
  artist: string
  key: string
  capo: number
  content: string
  language: string
  tags: string
  album: string | null
  year: number | null
  youtube_url: string | null
  spotify_url: string | null
  state: number
  created_at: string | null
  updated_at: string | null
  semitones: number
  position: number | null
}

export interface PreviewCanconer {
  id: number
  user_id: number
  title: string
  share_token: string | null
  style: CanconerStyle
  accent_color: string | null
  pdf_options: PdfOptions | null
  created_at: string | null
  updated_at: string | null
  songs: PreviewCanconerSong[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Resol l'URL de plataforma a partir de les preferències del cançoner. */
export function resolveLinkUrl(
  platform: "none" | "youtube" | "spotify",
  yt: string | null,
  sp: string | null,
): string | null {
  if (platform === "none") return null
  if (platform === "youtube") return yt ?? sp ?? null
  return sp ?? yt ?? null
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  canconer: PreviewCanconer
  ownerName: string
  /** Ruta del botó "Enrere". Per defecte `/`. */
  backHref?: string
  /** Text del botó "Enrere". Per defecte `← Cançoner`. */
  backLabel?: string
}

// ─── Component ────────────────────────────────────────────────────────────

/**
 * CanconerPreviewLayout — layout de vista prèvia d'un cançoner.
 *
 * Compartit entre:
 *   · /c/[token]                              (vista pública compartida)
 *   · /app/library/canconers/[id]/preview     (vista privada del propietari)
 *
 * Reprodueix exactament el JSX de la pàgina /c/[token] original,
 * parametritzat per `backHref`, `backLabel` i `ownerName`.
 */
export default function CanconerPreviewLayout({
  canconer,
  ownerName,
  backHref = "/",
  backLabel = "← Cançoner",
}: Props) {
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
        <a href={backHref} className="back-link">
          {backLabel}
        </a>
        <h1 id="shared-title">{canconer.title}</h1>
        <p className="subtitle" id="shared-meta">
          Per {ownerName} · {canconer.songs.length} cançons
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
