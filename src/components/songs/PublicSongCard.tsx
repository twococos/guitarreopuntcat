"use client"
import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { PublicKeyMenu } from "@/components/songs/PublicKeyMenu"
import {
  transposeChord,
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
import { ReportButton } from "@/components/reports/ReportButton"
import { ReportPanel } from "@/components/reports/ReportPanel"
import { ReportableSongBody } from "@/components/reports/ReportableSongBody"
import { useSongReport, type ReportContext } from "@/components/reports/useSongReport"

export type PublicSongData = Pick<
  Song,
  "id" | "title" | "artist" | "key" | "content" | "capo" | "album" | "year"
> & {
  artist_slug: string | null
  song_slug: string | null
  /** Per al formulari de dades del report (opcional: els cançoners no el porten). */
  youtube_url?: string | null
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
  titlePrefix,
  report,
  onReportOpen,
  body,
  displayContent,
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
  /** A l'esquerra del títol i l'artista, centrat entre les dues línies
   *  (dins d'un cançoner, el número de la cançó). */
  titlePrefix?: ReactNode
  /** Botó «Reporta un error» (només cançons públiques). On s'ha obert, per al registre. */
  report?: ReportContext
  /** En obrir el report (p. ex. per aturar l'autoscroll). */
  onReportOpen?: () => void
  /** Cos alternatiu (el reproductor hi posa el sincronitzat). En mode report mana el report. */
  body?: ReactNode
  /** Content que es mostra (arranjament ràpid, §22). El report sempre treballa sobre l'original. */
  displayContent?: string
}) {
  const t = getT()
  const [keyPickerOpen, setKeyPickerOpen] = useState(false)
  const [keyPickerPos, setKeyPickerPos] = useState({ x: 0, y: 0 })
  const keyBadgeRef = useRef<HTMLButtonElement>(null)

  const notationMap = flats ? ALL_FLATS : ALL_SHARPS
  const displayKey = respellAccidentals(transposeKey(song.key, semitones), notationMap)
  const originalKey = respellAccidentals(song.key, notationMap)
  const transposedContent = respellContent(transposeContent(displayContent ?? song.content, semitones), notationMap)
  const showOriginal = displayKey !== originalKey

  const reporter = useSongReport({
    songId: song.id,
    content: song.content,
    semitones,
    context: report ?? { source: "song" },
  })
  const reporting = Boolean(report) && reporter.active
  const cardRef = useRef<HTMLElement>(null)
  // Tonalitat proposada al report en curs: es mostra al lloc del to
  const keyItem = reporting ? reporter.items.findLast((it) => it.kind === "song_key") : undefined
  const proposedKey =
    keyItem?.kind === "song_key" ? respellAccidentals(transposeChord(keyItem.to_key, semitones), notationMap) : null

  // Mentre es reporta, la resta de la pàgina queda atenuada i sense la barra de controls
  useEffect(() => {
    document.body.classList.toggle("report-active", reporting)
    return () => document.body.classList.remove("report-active")
  }, [reporting])

  function openReport() {
    onReportOpen?.()
    reporter.open()
  }

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
      <article
        ref={cardRef}
        className={`public-song-card song${reporting ? " is-reporting" : ""}`}
        data-style="classic"
      >
        <div className="public-song-header">
          <div className="public-song-title-row">
            <div className={`public-song-heading-wrap${titlePrefix ? " has-prefix" : ""}`}>
              {titlePrefix && <div className="public-song-heading-prefix">{titlePrefix}</div>}
              <div className="public-song-heading">
                <Title className="public-song-title">
                  {titleHref ? <Link href={titleHref} className="public-song-title-link">{song.title}</Link> : song.title}
                </Title>
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
            </div>
            <div className="public-song-header-side">
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
                  {proposedKey ? (
                    <>
                      <s className="public-song-key-current rp-key-old">{displayKey}</s>
                      <span className="public-song-key-current rp-key-new">{proposedKey}</span>
                    </>
                  ) : (
                    <span className="public-song-key-current">{displayKey}</span>
                  )}
                  {showOriginal && (
                    <span className="public-song-key-original">− Orig. {originalKey}</span>
                  )}
                </button>
                {headerActions}
              </div>
            </div>
          </div>
        </div>

        {report && <ReportButton onClick={openReport} hidden={reporting} />}

        {reporting ? (
          <ReportableSongBody
            report={reporter}
            content={song.content}
            semitones={semitones}
            notation={notationMap}
            displayKey={transposeChord(song.key, semitones)}
          />
        ) : (
          body ?? (
            <div
              className="song-body"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: transposedContent }}
            />
          )
        )}
      </article>

      {report && (
        <ReportPanel
          report={reporter}
          anchorRef={cardRef}
          song={{
            title: song.title,
            artist: song.artist,
            album: song.album ?? null,
            year: song.year ?? null,
            capo: song.capo ?? null,
            youtube_url: song.youtube_url ?? null,
            key: song.key,
          }}
          semitones={semitones}
          notation={notationMap}
        />
      )}

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
