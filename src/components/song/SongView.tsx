import type { CSSProperties } from "react"
import { QRCodeSVG } from "qrcode.react"
import { transposeKey, transposeContent } from "@/lib/transpose"
import type { Song, CanconerStyle } from "@/types/song"
import { getT } from "@/lib/i18n"

/**
 * SongView — component presentacional unificat de cançó.
 *
 * S'usa a tots els llocs on es renderitza una cançó al frontend:
 *   · vista prèvia del cançoner (col 3 de la pàgina principal)
 *   · vista prèvia de l'editor
 *   · pàgina pública /c/[token]
 *
 * El PDF generat per Puppeteer reutilitza la mateixa estructura HTML
 * via la funció `renderSongHtml()` exportada aquí sota.
 *
 * Tot l'estil viu a src/styles/song.css. Canvis allà es propaguen
 * automàticament a totes les ubicacions, PDF inclòs.
 */

export interface SongViewProps {
  song: Pick<Song, "title" | "artist" | "key" | "content" | "capo" | "album" | "year">
  semitones: number
  /** Posició dins el cançoner. Omet a l'editor. */
  number?: number
  /** Id HTML opcional aplicat al `<article>` (per al scroll-spy del compartit). */
  id?: string
  /** Variant d'estil del cançoner. Default `"classic"`. */
  styleVariant?: CanconerStyle
  /** Override del color d'accent. Null/undef = usa el default del preset. */
  accentColor?: string | null
  /** URL del títol clicable (sol al PDF i a la vista del cançoner). */
  titleLinkUrl?: string | null
  /** URL del QR. Si null/undef no es renderitza. */
  qrUrl?: string | null
}

/** Construeix la sublínia de l'artista amb separadors `·` només
 *  quan el camp existeix: artista · àlbum (any) · Celleta X. */
function formatArtistLine(
  artist: string,
  album: string | null | undefined,
  year: number | null | undefined,
  capo: number | null | undefined,
): string {
  const t = getT()
  const parts: string[] = [artist]
  if (album && year) parts.push(`${album} (${year})`)
  else if (album) parts.push(album)
  else if (year) parts.push(String(year))
  if (capo) parts.push(t.public.publicSong.celleta(capo))
  return parts.join(" · ")
}

export function SongView({
  song,
  semitones,
  number,
  id,
  styleVariant,
  accentColor,
  titleLinkUrl,
  qrUrl,
}: SongViewProps) {
  const t = getT()
  const displayKey = transposeKey(song.key, semitones)
  const transposedContent = transposeContent(song.content, semitones)
  const showOriginal = displayKey !== song.key

  const inlineStyle = accentColor ? ({ "--accent": accentColor } as CSSProperties) : undefined

  const titleNode = titleLinkUrl ? (
    <a className="song-title-link" href={titleLinkUrl} target="_blank" rel="noopener noreferrer">
      {song.title || " "}
    </a>
  ) : (
    song.title || " "
  )

  return (
    <article className="song" id={id} data-style={styleVariant ?? "classic"} style={inlineStyle}>
      <div className="song-head-wrap">
        <header className="song-head">
          {number != null && <span className="song-number">{number}</span>}
          <div className="song-titles">
            <h2 className="song-title">{titleNode}</h2>
            <p className="song-artist">
              {formatArtistLine(song.artist, song.album, song.year, song.capo)}
            </p>
          </div>
          <div className="song-keys">
            <span className="song-key">{displayKey}</span>
            {showOriginal && <span className="song-key-original">(orig. {song.key})</span>}
          </div>
        </header>
        {qrUrl && (
          <a
            className="song-qr"
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.public.publicSong.obrirEnllacAriaLabel}
          >
            <QRCodeSVG value={qrUrl} size={60} level="M" />
          </a>
        )}
      </div>
      <div
        className="song-body"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: transposedContent }}
      />
    </article>
  )
}

/* ── Helper per al PDF (Puppeteer) ─────────────────────────── */

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

export interface RenderSongHtmlOptions {
  title: string
  artist: string
  key: string
  content: string
  capo: number | null
  album?: string | null
  year?: number | null
  semitones: number
  number?: number
  styleVariant?: CanconerStyle
  accentColor?: string | null
  /** Si es passa, el títol és clicable cap a aquesta URL al PDF. */
  titleLinkUrl?: string | null
  /** SVG inline d'un codi QR — col·locat fora del header, a la dreta. */
  qrSvg?: string | null
  /** Mateix URL del QR, perquè en clicar-lo s'obri (PDF clicable). */
  qrUrl?: string | null
}

/**
 * Genera l'HTML d'una cançó com a string, amb la mateixa estructura
 * que produeix <SongView />. S'usa al PDF (Puppeteer) per garantir
 * que React i el PDF mai no es desincronitzen.
 *
 * El `content` ja conté tags `<ch>` i `<sec>` literals i NO s'escapa.
 * La resta de camps sí (poden contenir caràcters especials).
 */
export function renderSongHtml(opts: RenderSongHtmlOptions): string {
  const t = getT()
  const displayKey = transposeKey(opts.key, opts.semitones)
  const transposedContent = transposeContent(opts.content, opts.semitones)
  const showOriginal = displayKey !== opts.key

  const numberHtml = opts.number != null ? `<span class="song-number">${opts.number}</span>` : ""

  const artistLineParts: string[] = [opts.artist]
  if (opts.album && opts.year) artistLineParts.push(`${opts.album} (${opts.year})`)
  else if (opts.album) artistLineParts.push(opts.album)
  else if (opts.year) artistLineParts.push(String(opts.year))
  if (opts.capo) artistLineParts.push(t.public.publicSong.celleta(opts.capo))
  const artistLine = artistLineParts.join(" · ")

  const originalHtml = showOriginal
    ? `<span class="song-key-original">(orig. ${escHtml(opts.key)})</span>`
    : ""

  const dataStyle = opts.styleVariant ?? "classic"
  const styleAttr = opts.accentColor ? ` style="--accent: ${opts.accentColor}"` : ""

  const titleHtml = opts.titleLinkUrl
    ? `<a class="song-title-link" href="${escAttr(opts.titleLinkUrl)}" target="_blank" rel="noopener">${escHtml(opts.title)}</a>`
    : escHtml(opts.title)

  const qrHtml =
    opts.qrSvg && opts.qrUrl
      ? `<a class="song-qr" href="${escAttr(opts.qrUrl)}" target="_blank" rel="noopener">${opts.qrSvg}</a>`
      : opts.qrSvg
        ? `<div class="song-qr">${opts.qrSvg}</div>`
        : ""

  return `<article class="song" data-style="${dataStyle}"${styleAttr}>
  <div class="song-head-wrap">
    <header class="song-head">
      ${numberHtml}
      <div class="song-titles">
        <h2 class="song-title">${titleHtml}</h2>
        <p class="song-artist">${escHtml(artistLine)}</p>
      </div>
      <div class="song-keys">
        <span class="song-key">${escHtml(displayKey)}</span>
        ${originalHtml}
      </div>
    </header>
    ${qrHtml}
  </div>
  <div class="song-body">${transposedContent}</div>
</article>`
}
