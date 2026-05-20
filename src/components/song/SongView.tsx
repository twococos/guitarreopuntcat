import type { CSSProperties } from "react"
import { transposeKey, transposeContent } from "@/lib/transpose"
import type { Song, CanconerStyle } from "@/types/song"

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
  song: Pick<Song, "title" | "artist" | "key" | "content" | "capo">
  semitones: number
  /** Posició dins el cançoner. Omet a l'editor. */
  number?: number
  /** Id HTML opcional aplicat al `<article>` (per al scroll-spy del compartit). */
  id?: string
  /** Variant d'estil del cançoner. Default `"classic"`. */
  styleVariant?: CanconerStyle
  /** Override del color d'accent. Null/undef = usa el default del preset. */
  accentColor?: string | null
}

export function SongView({
  song,
  semitones,
  number,
  id,
  styleVariant,
  accentColor,
}: SongViewProps) {
  const displayKey = transposeKey(song.key, semitones)
  const transposedContent = transposeContent(song.content, semitones)
  const showOriginal = displayKey !== song.key

  const inlineStyle = accentColor
    ? ({ "--accent": accentColor } as CSSProperties)
    : undefined

  return (
    <article
      className="song"
      id={id}
      data-style={styleVariant ?? "classic"}
      style={inlineStyle}
    >
      <header className="song-head">
        {number != null && <span className="song-number">{number}</span>}
        <div className="song-titles">
          <h2 className="song-title">{song.title || " "}</h2>
          <p className="song-artist">
            {song.artist}
            {song.capo ? ` · Cejilla ${song.capo}` : ""}
          </p>
        </div>
        <div className="song-keys">
          <span className="song-key">{displayKey}</span>
          {showOriginal && (
            <span className="song-key-original">(orig. {song.key})</span>
          )}
        </div>
      </header>
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export interface RenderSongHtmlOptions {
  title: string
  artist: string
  key: string
  content: string
  capo: number | null
  semitones: number
  number?: number
  styleVariant?: CanconerStyle
  accentColor?: string | null
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
  const displayKey = transposeKey(opts.key, opts.semitones)
  const transposedContent = transposeContent(opts.content, opts.semitones)
  const showOriginal = displayKey !== opts.key

  const numberHtml =
    opts.number != null
      ? `<span class="song-number">${opts.number}</span>`
      : ""

  const capoSuffix = opts.capo ? ` · Cejilla ${opts.capo}` : ""

  const originalHtml = showOriginal
    ? `<span class="song-key-original">(orig. ${escHtml(opts.key)})</span>`
    : ""

  const dataStyle = opts.styleVariant ?? "classic"
  const styleAttr = opts.accentColor
    ? ` style="--accent: ${opts.accentColor}"`
    : ""

  return `<article class="song" data-style="${dataStyle}"${styleAttr}>
  <header class="song-head">
    ${numberHtml}
    <div class="song-titles">
      <h2 class="song-title">${escHtml(opts.title)}</h2>
      <p class="song-artist">${escHtml(opts.artist)}${escHtml(capoSuffix)}</p>
    </div>
    <div class="song-keys">
      <span class="song-key">${escHtml(displayKey)}</span>
      ${originalHtml}
    </div>
  </header>
  <div class="song-body">${transposedContent}</div>
</article>`
}
