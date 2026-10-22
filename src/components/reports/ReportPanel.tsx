"use client"
import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { getT } from "@/lib/i18n"
import { describeItem } from "@/lib/reports/describe"
import { CHROMATIC, respellAccidentals, transposeChord, type AccidentalMap } from "@/lib/transpose"
import { REPORT_CATEGORIES, type MetaField, type ReportItem } from "@/lib/schemas/report"
import { IconCheckCircle, IconChevronLeft, IconChevronRight, IconPlus, IconX } from "@/components/shared/Icons"
import { UI_KINDS, type FormKind, type SongReport } from "./useSongReport"
import { navBottom } from "./ReportButton"

export interface ReportSongMeta {
  title: string
  artist: string
  album: string | null
  year: number | null
  capo: number | null
  youtube_url: string | null
  /** To original de la cançó. */
  key: string
}

/**
 * Panell del report: categories, tipus d'error, formularis (to, dades, text),
 * llista de correccions abans d'enviar i agraïment. En mode correcció (quan es
 * toca la cançó) no es mostra: hi ha la franja d'instruccions.
 */
export function ReportPanel({
  report,
  anchorRef,
  song,
  semitones,
  notation,
}: {
  report: SongReport
  /** Targeta de la cançó: el panell queda centrat sobre la seva vora dreta. */
  anchorRef: RefObject<HTMLElement | null>
  song: ReportSongMeta
  semitones: number
  notation: AccidentalMap
}) {
  const t = getT().public.report
  const { step } = report
  const visible = step.name !== "closed" && step.name !== "mark"
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!visible) return
    function place() {
      const card = anchorRef.current
      const panel = panelRef.current
      if (!card || !panel) return
      const w = panel.offsetWidth
      const left = Math.max(8, Math.min(card.getBoundingClientRect().right - w / 2, window.innerWidth - w - 8))
      setPos({ left, top: Math.max(navBottom(), 0) + 16 })
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [visible, anchorRef])

  if (!visible) return null

  const show = (chord: string) => respellAccidentals(transposeChord(chord, semitones), notation)
  const canGoBack = step.name === "kinds" || step.name === "form" || (step.name === "categories" && report.items.length > 0)

  let title: string = t.titol
  if (step.name === "kinds") title = t.categories[step.category]
  if (step.name === "form") title = t.kinds[step.kind].label
  if (step.name === "review" || step.name === "sending") title = t.review.titol(report.items.length)
  if (step.name === "thanks") title = t.thanks.titol

  return createPortal(
    <>
      <div className="rp-backdrop" onClick={step.name === "thanks" ? report.close : undefined} />
      <div
        ref={panelRef}
        className={`rp-panel rp-panel-${step.name}`}
        role="dialog"
        aria-label={title}
        style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
      >
        <div className="rp-panel-head">
          {canGoBack ? (
            <button type="button" className="rp-icon-btn" onClick={report.back} aria-label={t.enrere} title={t.enrere}>
              <IconChevronLeft />
            </button>
          ) : (
            <span />
          )}
          <h2 className="rp-panel-title">{title}</h2>
          <button type="button" className="rp-icon-btn" onClick={report.close} aria-label={t.cancel} title={t.cancel}>
            <IconX />
          </button>
        </div>

        {step.name === "categories" && (
          <>
            <p className="rp-panel-sub">{t.subtitol}</p>
            <div className="rp-category-grid">
              {REPORT_CATEGORIES.map((c) => (
                <button key={c} type="button" className="rp-category" onClick={() => report.pickCategory(c)}>
                  <strong>{t.categories[c]}</strong>
                  <small>{t.categoryHints[c]}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step.name === "kinds" && (
          <ul className="rp-kind-list">
            {UI_KINDS[step.category].map((k) => (
              <li key={k}>
                <button type="button" className="rp-kind" onClick={() => report.pickKind(k, step.category)}>
                  <span>
                    <strong>{t.kinds[k].label}</strong>
                    <small>{t.kinds[k].hint}</small>
                  </span>
                  <IconChevronRight />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step.name === "form" && (
          <ReportForm kind={step.kind} song={song} semitones={semitones} notation={notation} onAdd={report.addItem} />
        )}

        {(step.name === "review" || step.name === "sending") && (
          <form
            className="rp-review"
            onSubmit={(e) => {
              e.preventDefault()
              void report.send()
            }}
          >
            <ul className="rp-item-list">
              {report.items.map((item, i) => (
                <li key={i}>
                  <IconCheckCircle className="rp-item-ok" />
                  <span>{describeItem(item, show)}</span>
                  <button
                    type="button"
                    className="rp-icon-btn"
                    onClick={() => report.removeItem(i)}
                    aria-label={t.review.treu}
                    title={t.review.treu}
                  >
                    <IconX />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="rp-btn rp-btn-ghost rp-add-more" onClick={report.addMore}>
              <IconPlus /> {t.review.afegeix}
            </button>
            <label className="rp-field">
              <span>{t.review.comentari}</span>
              <textarea rows={2} maxLength={2000} value={report.comment} onChange={(e) => report.setComment(e.target.value)} />
            </label>
            {/* Camp trampa: les persones no el veuen; els bots l'omplen */}
            <input
              className="rp-hp"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={report.honeypot}
              onChange={(e) => report.setHoneypot(e.target.value)}
            />
            <button type="submit" className="rp-btn rp-btn-primary" disabled={step.name === "sending"}>
              {step.name === "sending" ? t.review.enviant : t.review.envia}
            </button>
          </form>
        )}

        {step.name === "thanks" && (
          <div className="rp-thanks">
            <IconCheckCircle className="rp-thanks-icon" />
            <p>{t.thanks.text}</p>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}

/* ── Formularis dels tipus que no es marquen sobre la cançó ── */

const META_INPUTS: Exclude<MetaField, "youtube_broken">[] = ["title", "artist", "album", "year", "capo", "youtube_url"]

function ReportForm({
  kind,
  song,
  semitones,
  notation,
  onAdd,
}: {
  kind: FormKind
  song: ReportSongMeta
  semitones: number
  notation: AccidentalMap
  onAdd: (items: ReportItem | ReportItem[]) => void
}) {
  const t = getT().public.report
  const initial: Record<string, string> = {
    title: song.title,
    artist: song.artist,
    album: song.album ?? "",
    year: song.year ? String(song.year) : "",
    capo: song.capo ? String(song.capo) : "",
    youtube_url: song.youtube_url ?? "",
  }
  const [values, setValues] = useState(initial)
  const [broken, setBroken] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState(false)

  if (kind === "song_key") {
    // To que es veu (sostinguts) i els 12 del mateix mode
    const display = transposeChord(song.key, semitones)
    const minor = /m$/.test(display)
    const rootIdx = (k: string) => (CHROMATIC as readonly string[]).indexOf(k.replace(/m$/, ""))
    return (
      <div className="rp-form">
        <p className="rp-panel-sub">{t.key.actual(respellAccidentals(display, notation))}</p>
        <div className="rp-key-grid">
          {CHROMATIC.map((root) => {
            const k = root + (minor ? "m" : "")
            const delta = (rootIdx(k) - rootIdx(display) + 12) % 12
            return (
              <button
                key={k}
                type="button"
                className={`rp-chord-btn${delta === 0 ? " is-current" : ""}`}
                disabled={delta === 0}
                onClick={() =>
                  onAdd({ kind: "song_key", semitones: delta, from_key: song.key, to_key: transposeChord(song.key, delta) })
                }
              >
                {respellAccidentals(k, notation)}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (kind === "meta") {
    return (
      <form
        className="rp-form"
        onSubmit={(e) => {
          e.preventDefault()
          const items: ReportItem[] = META_INPUTS.filter((f) => values[f].trim() !== initial[f]).map((f) => ({
            kind: "meta",
            field: f,
            from: initial[f],
            to: values[f].trim(),
          }))
          if (broken) items.push({ kind: "meta", field: "youtube_broken", from: initial.youtube_url, to: "" })
          if (!items.length) {
            setError(true)
            return
          }
          onAdd(items)
        }}
      >
        <p className="rp-panel-sub">{t.meta.titol}</p>
        {META_INPUTS.map((f) => (
          <label key={f} className="rp-field">
            <span>{t.meta[f]}</span>
            <input
              value={values[f]}
              inputMode={f === "year" || f === "capo" ? "numeric" : undefined}
              maxLength={f === "youtube_url" ? 300 : 200}
              onChange={(e) => {
                setValues({ ...values, [f]: e.target.value })
                setError(false)
              }}
            />
          </label>
        ))}
        {song.youtube_url && (
          <label className="rp-check">
            <input type="checkbox" checked={broken} onChange={(e) => setBroken(e.target.checked)} />
            {t.meta.youtubeBroken}
          </label>
        )}
        {error && <p className="rp-error">{t.meta.capCanvi}</p>}
        <button type="submit" className="rp-btn rp-btn-primary">
          {t.other.afegeix}
        </button>
      </form>
    )
  }

  // other i lyric_version: text lliure (obligatori només a «Una altra cosa»)
  const required = kind === "other"
  return (
    <form
      className="rp-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (required && !text.trim()) return
        onAdd(kind === "other" ? { kind: "other", text: text.trim() } : { kind: "lyric_version", text: text.trim() })
      }}
    >
      <textarea
        className="rp-textarea"
        rows={4}
        maxLength={2000}
        autoFocus
        value={text}
        placeholder={kind === "other" ? t.other.placeholder : t.other.versionPlaceholder}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="rp-btn rp-btn-primary" disabled={required && !text.trim()}>
        {t.other.afegeix}
      </button>
    </form>
  )
}
