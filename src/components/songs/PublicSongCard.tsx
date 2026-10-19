"use client"
import { useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { PublicKeyMenu } from "@/components/songs/PublicKeyMenu"
import {
  transposeKey,
  transposeContent,
  respellAccidentals,
  respellContent,
  ALL_SHARPS,
  ALL_FLATS,
  CHROMATIC,
} from "@/lib/transpose"
import type { Song } from "@/types/song"
import { getT } from "@/lib/i18n"
import { SEMITONES_MAX, SEMITONES_MIN } from "./useReaderControls"

export type PublicSongData = Pick<
  Song,
  "id" | "title" | "artist" | "key" | "content" | "capo" | "album" | "year"
> & {
  artist_slug: string | null
  song_slug: string | null
}

/**
 * Targeta d'una cançó a les pàgines públiques: capçalera (títol, artista,
 * tonalitat clicable amb el selector) i cos transposat. La comparteixen la
 * pàgina de cançó, el visor de privades i el de cançoners.
 */
export function PublicSongCard({
  song,
  semitones,
  flats,
  onSemitonesChange,
  headerActions,
  extraLine,
  titleLevel = 1,
  titleHref,
}: {
  song: PublicSongData
  semitones: number
  flats: boolean
  onSemitonesChange: (s: number) => void
  /** Botons a la dreta de la tonalitat (CTA, edita…). */
  headerActions?: ReactNode
  /** Línia extra sota l'artista (p. ex. "Arranjament de …"). */
  extraLine?: ReactNode
  /** h1 a la pàgina d'una cançó; h2 dins d'un cançoner. */
  titleLevel?: 1 | 2
  /** Enllaç del títol (dins d'un cançoner, a la pàgina pública de la cançó). */
  titleHref?: string | null
}) {
  const t = getT()
  const [keyPickerOpen, setKeyPickerOpen] = useState(false)
  const [keyPickerPos, setKeyPickerPos] = useState({ x: 0, y: 0 })
  const keyBadgeRef = useRef<HTMLButtonElement>(null)

  const notationMap = flats ? ALL_FLATS : ALL_SHARPS
  const displayKey = respellAccidentals(transposeKey(song.key, semitones), notationMap)
  const originalKey = respellAccidentals(song.key, notationMap)
  const transposedContent = respellContent(transposeContent(song.content, semitones), notationMap)
  const showOriginal = displayKey !== originalKey

  function openKeyPicker(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (!keyBadgeRef.current) return
    const r = keyBadgeRef.current.getBoundingClientRect()
    setKeyPickerPos({ x: r.left, y: r.bottom + 6 })
    setKeyPickerOpen(true)
  }

  /** Tria d'una tonalitat al KeyPicker → semitons entre l'original i la triada. */
  function handleKeyChange(newKey: string) {
    const delta = semitonesBetweenKeys(song.key, newKey)
    if (delta !== null) {
      // Normalitza dins de [-11, +11] preferint el camí més curt.
      let d = delta
      if (d > SEMITONES_MAX) d -= 12
      if (d < SEMITONES_MIN) d += 12
      onSemitonesChange(d)
    }
  }

  const artistHref = song.artist_slug ? `/songs/${song.artist_slug}` : null
  const subline = formatSubline(song.album, song.year, song.capo)
  const Title = titleLevel === 1 ? "h1" : "h2"

  return (
    <>
      <article className="public-song-card song" data-style="classic">
        <div className="public-song-header">
          <div className="public-song-title-row">
            <Title className="public-song-title">
              {titleHref ? <Link href={titleHref} className="public-song-title-link">{song.title}</Link> : song.title}
            </Title>
            <div className="public-song-header-actions">
              <button
                ref={keyBadgeRef}
                type="button"
                className="public-song-key-badge song-key"
                onClick={openKeyPicker}
                aria-label={t.public.publicSong.controls.canviarTonalitat}
                aria-haspopup="dialog"
                aria-expanded={keyPickerOpen}
                title={t.public.publicSong.controls.canviarTonalitat}
              >
                <span className="public-song-key-current">{displayKey}</span>
                {showOriginal && (
                  <span className="public-song-key-original">− Orig. {originalKey}</span>
                )}
              </button>
              {headerActions}
            </div>
          </div>
          <p className="public-song-artist-line">
            {artistHref ? (
              <Link href={artistHref} className="public-song-artist-link">
                {song.artist}
              </Link>
            ) : (
              <span>{song.artist}</span>
            )}
            {subline && <span className="public-song-subline">{subline}</span>}
          </p>
          {extraLine && <p className="public-song-extra-line">{extraLine}</p>}
        </div>

        <div
          className="song-body"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: transposedContent }}
        />
      </article>

      <PublicKeyMenu
        open={keyPickerOpen}
        originalKey={song.key}
        currentKey={displayKey}
        x={keyPickerPos.x}
        y={keyPickerPos.y}
        onSelect={handleKeyChange}
        onClose={() => setKeyPickerOpen(false)}
      />
    </>
  )
}

/* ── Helpers locals ────────────────────────────────────────── */

function formatSubline(
  album: string | null | undefined,
  year: number | null | undefined,
  capo: number | null | undefined,
): string | null {
  const t = getT()
  const parts: string[] = []
  if (album && year) parts.push(`${album} (${year})`)
  else if (album) parts.push(album)
  else if (year) parts.push(String(year))
  if (capo) parts.push(t.public.publicSong.celleta(capo))
  return parts.length ? parts.join(" · ") : null
}

/** Retorna els semitons (positius) per anar de `from` a `to` dins l'octava.
 *  Tracta menors i majors igual: només compara arrels. Retorna null si no
 *  reconeix alguna de les claus. */
function semitonesBetweenKeys(from: string, to: string): number | null {
  const fromIdx = rootIndex(from)
  const toIdx = rootIndex(to)
  if (fromIdx === null || toIdx === null) return null
  return (toIdx - fromIdx + 12) % 12
}

function rootIndex(key: string): number | null {
  const m = key.match(/^([A-G][b#]?)/)
  if (!m) return null
  const root = m[1] ?? ""
  const flat: Record<string, string> = {
    Db: "C#",
    Eb: "D#",
    Fb: "E",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
    Cb: "B",
  }
  const norm = flat[root] ?? root
  const idx = (CHROMATIC as readonly string[]).indexOf(norm)
  return idx === -1 ? null : idx
}
