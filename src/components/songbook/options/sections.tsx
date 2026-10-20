"use client"
import { useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { AccentPicker } from "../AccentPicker"
import { CanconerTitleInput } from "../CanconerTitleInput"
import { getT } from "@/lib/i18n"
import { IconShuffle } from "@/components/shared/Icons"
import {
  CANCONER_STYLES,
  STYLE_LABELS,
  STYLE_DEFAULT_ACCENTS,
  STYLE_TITLE_FONTS,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
  LINK_PLATFORMS,
  type CanconerStyle,
  type LinkPlatform,
} from "@/lib/schemas/canconer"
import {
  ENHARMONIC_NOTES,
  ALL_SHARPS,
  ALL_FLATS,
  SHARP_TO_FLAT,
  type AccidentalMap,
} from "@/lib/transpose"
import type { CSSProperties } from "react"

/* Contingut de cada categoria del panell «Opcions i format». */

/* ── StyleSelect ────────────────────────────────────────── */

function StyleSelect() {
  const t = getT()
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const setCanconerStyle = useSongbookStore((s) => s.setCanconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const setAccentColor = useSongbookStore((s) => s.setAccentColor)
  const [pickerOpen, setPickerOpen] = useState(false)

  const effectiveColor = accentColor ?? STYLE_DEFAULT_ACCENTS[canconerStyle]

  return (
    <div className="sort-control">
      <select
        id="canconer-style"
        value={canconerStyle}
        onChange={(e) => setCanconerStyle(e.target.value as CanconerStyle)}
        style={{ fontFamily: STYLE_TITLE_FONTS[canconerStyle] }}
      >
        {CANCONER_STYLES.map((s) => (
          <option key={s} value={s} style={{ fontFamily: STYLE_TITLE_FONTS[s] }}>
            {STYLE_LABELS[s]}
          </option>
        ))}
      </select>
      <div className="accent-picker-wrapper">
        <button
          type="button"
          className="accent-swatch"
          style={{ background: effectiveColor }}
          onClick={() => setPickerOpen((p) => !p)}
          title={t.app.songbook.detailPanel.colorAccentTitle}
          aria-label={t.app.songbook.detailPanel.colorAccentAriaLabel}
        />
        {pickerOpen && (
          <AccentPicker
            value={accentColor}
            onChange={(c) => setAccentColor(c)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

/* ── SortControls ──────────────────────────────────────────── */

function SortControls() {
  const t = getT()
  const sortMode = useSongbookStore((s) => s.sortMode)
  const sortAsc = useSongbookStore((s) => s.sortAsc)
  const setSortMode = useSongbookStore((s) => s.setSortMode)
  const toggleSortDir = useSongbookStore((s) => s.toggleSortDir)
  const reshuffle = useSongbookStore((s) => s.reshuffle)

  return (
    <div className="sort-control">
      <select
        id="canconer-sort"
        value={sortMode}
        onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
      >
        <option value="custom">{t.app.songbook.detailPanel.ordenacioOpcions.personalitzat}</option>
        <option value="title">{t.app.songbook.detailPanel.ordenacioOpcions.perTitol}</option>
        <option value="artist">{t.app.songbook.detailPanel.ordenacioOpcions.perArtistaITitol}</option>
        <option value="random">{t.app.songbook.detailPanel.ordenacioOpcions.aleatori}</option>
      </select>
      {(sortMode === "title" || sortMode === "artist") && (
        <button
          id="btn-sort-dir"
          className="btn-sort-extra"
          title={t.app.songbook.detailPanel.canviarOrdreTitle}
          onClick={toggleSortDir}
        >
          <span id="sort-dir-icon">{sortAsc ? "↑" : "↓"}</span>
        </button>
      )}
      {sortMode === "random" && (
        <button
          id="btn-sort-random"
          className="btn-sort-extra"
          title={t.app.songbook.detailPanel.tornarAAleatorizarTitle}
          onClick={reshuffle}
          aria-label={t.app.songbook.detailPanel.tornarAAleatorizarTitle}
        >
          <IconShuffle />
        </button>
      )}
    </div>
  )
}

/* ── KeyFilterGrid ─────────────────────────────────────────── */

function KeyFilterGrid() {
  const allowedKeys = useSongbookStore((s) => s.allowedKeys)
  const toggleAllowedKey = useSongbookStore((s) => s.toggleAllowedKey)
  const applyAllowedKeys = useSongbookStore((s) => s.applyAllowedKeys)

  // El canvi s'aplica immediatament: en commutar una tonalitat es
  // transposen les cançons afectades a l'instant (sense botó "Aplicar").
  function onToggle(key: string) {
    toggleAllowedKey(key)
    applyAllowedKeys()
  }

  return (
    <div id="key-filter-grid" className="key-filter-grid">
      {ALL_MAJOR_KEYS.map((key) => (
        <button
          key={key}
          className={`key-filter-btn${allowedKeys.has(key) ? " active" : ""}`}
          title={`${key} major / ${RELATIVE_MINOR[key]}`}
          onClick={() => onToggle(key)}
        >
          <span className="kf-major">{key}</span>
          <span className="kf-minor">{RELATIVE_MINOR[key]}</span>
        </button>
      ))}
    </div>
  )
}

/* ── OptToggle ───────────────────────────────────────────────
 *  Interruptor (switch) que llisca cap a la dreta agafant el color
 *  --accent quan està actiu i queda --muted quan està desactivat.
 *  Substitueix les caselles de verificació clàssiques. */

function OptToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className={`switch-row${disabled ? " is-disabled" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`opt-switch${checked ? " is-on" : ""}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="opt-switch-knob" aria-hidden="true" />
      </button>
      <span className="switch-row-label">{label}</span>
    </label>
  )
}

/* ── StructureSection (Portada) ──────────────────────────────
 *  Títol + subtítol, i a sota els interruptors de portada i índex. */

export function StructureSection() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <CanconerTitleInput
        className="opt-input-text opt-title-input"
        ariaLabel={t.app.songbook.detailPanel.titolCanconer}
      />
      <input
        type="text"
        className="opt-input-text"
        placeholder={t.app.songbook.detailPanel.subtitolPlaceholder}
        disabled={!opts.show_cover}
        value={opts.cover_subtitle ?? ""}
        onChange={(e) => setOpt("cover_subtitle", e.target.value || null)}
        maxLength={200}
      />
      <div className="switch-row-pair">
        <OptToggle
          checked={opts.show_cover}
          onChange={(v) => setOpt("show_cover", v)}
          label={t.app.songbook.detailPanel.mostrarPortada}
        />
        <OptToggle
          checked={opts.show_index}
          onChange={(v) => setOpt("show_index", v)}
          label={t.app.songbook.detailPanel.mostrarIndex}
        />
      </div>
    </div>
  )
}

/* ── Enllaços, marges i format ──────────────────────────────── */

/** Desplegable de plataforma (YouTube/Spotify/Cap), reutilitzat per a
 *  l'enllaç clicable del títol i per al codi QR (independents). */
function PlatformSelect({
  value,
  onChange,
}: {
  value: LinkPlatform
  onChange: (v: LinkPlatform) => void
}) {
  const t = getT()
  const labels: Record<LinkPlatform, string> = {
    youtube: t.app.songbook.detailPanel.youtube,
    spotify: t.app.songbook.detailPanel.spotify,
    none: t.app.songbook.detailPanel.cap,
  }
  return (
    <select
      className="opt-select"
      value={value}
      onChange={(e) => onChange(e.target.value as LinkPlatform)}
    >
      {LINK_PLATFORMS.map((p) => (
        <option key={p} value={p}>
          {labels[p]}
        </option>
      ))}
    </select>
  )
}

type MarginKey = "margin_top" | "margin_bottom" | "margin_left" | "margin_right"

/** Caixa de marges en disposició "rombo" (model de caixa CSS): inputs
 *  als quatre costats d'una caixa interior dibuixada. En format llibre,
 *  els laterals són interior (esquerra a les pàgines senars) i exterior,
 *  i s'emmirallen a les parells (src/lib/pdf-client/paginate.ts). */
function MarginsBox() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)
  const d = t.app.songbook.detailPanel
  const labels: Record<MarginKey, string> = {
    margin_top: d.capçalera,
    margin_bottom: d.peuDePagina,
    margin_left: opts.book_format ? d.interior : d.esquerra,
    margin_right: opts.book_format ? d.exterior : d.dreta,
  }

  function edge(key: MarginKey, area: "top" | "left" | "right" | "bottom") {
    return (
      <label className={`margins-box-edge margins-box-${area}`}>
        <span className="margins-box-label">{labels[key]}</span>
        <input
          type="number"
          min={0}
          max={50}
          value={opts[key]}
          onChange={(e) => setOpt(key, Number(e.target.value))}
        />
      </label>
    )
  }

  return (
    <div className="margins-box">
      {edge("margin_top", "top")}
      {edge("margin_left", "left")}
      <div className="margins-box-inner" aria-hidden="true" />
      {edge("margin_right", "right")}
      {edge("margin_bottom", "bottom")}
    </div>
  )
}

export function StyleSection() {
  return (
    <div className="options-section">
      <StyleSelect />
    </div>
  )
}

/** Cos: columnes, mida de lletra, format llibre i, al final, marges. */
export function BodySection() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <div className="pdf-cols-group">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            className={`pdf-cols-btn${opts.columns === n ? " active" : ""}`}
            onClick={() => setOpt("columns", n)}
            title={`${n} ${n === 1 ? "columna" : "columnes"}`}
          >
            {n} {n === 1 ? "col" : "cols"}
          </button>
        ))}
      </div>
      <label className="opt-slider-row">
        <span>{t.app.songbook.detailPanel.midaLletra}</span>
        <input
          type="range"
          className="opt-slider"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={FONT_SCALE_STEP}
          value={opts.font_scale}
          onChange={(e) => setOpt("font_scale", Number(e.target.value))}
          style={
            {
              "--slider-fill": `${
                ((opts.font_scale - FONT_SCALE_MIN) / (FONT_SCALE_MAX - FONT_SCALE_MIN)) * 100
              }%`,
            } as CSSProperties
          }
        />
        <span className="opt-slider-value">{Math.round(opts.font_scale * 100)}%</span>
      </label>

      <h4 className="options-subsection">{t.app.songbook.detailPanel.paginacio}</h4>
      <OptToggle
        checked={opts.page_breaks}
        onChange={(v) => setOpt("page_breaks", v)}
        label={t.app.songbook.detailPanel.saltPaginaEntreCancons}
      />
      <OptToggle
        checked={opts.book_format}
        onChange={(v) => setOpt("book_format", v)}
        label={t.app.songbook.detailPanel.imprimirDoubleCara}
      />
      <p className="opt-hint">{t.app.songbook.detailPanel.formatLlibreHint}</p>

      <h4 className="options-subsection">{t.app.songbook.detailPanel.marges}</h4>
      <MarginsBox />
    </div>
  )
}

export function LinksSection() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <div className="pdf-links-row">
        <label className="pdf-link-field">
          <span>{t.app.songbook.detailPanel.enllacClicableTitol}</span>
          <PlatformSelect
            value={opts.link_platform}
            onChange={(v) => setOpt("link_platform", v)}
          />
        </label>
        <label className="pdf-link-field">
          <span>{t.app.songbook.detailPanel.codiQr}</span>
          <PlatformSelect
            value={opts.qr_platform}
            onChange={(v) => setOpt("qr_platform", v)}
          />
        </label>
      </div>
    </div>
  )
}

export function OrderSection() {
  return (
    <div className="options-section">
      <SortControls />
    </div>
  )
}

/** Les tonalitats s'apliquen en fer toggle, sense botó. */
export function KeysSection() {
  const t = getT()
  return (
    <div className="options-section">
      <KeyFilterGrid />
      <p className="key-filter-hint">{t.app.songbook.detailPanel.tonalitatsPermesesHint}</p>
    </div>
  )
}


/* ── NotationSection ───────────────────────────────────────── */

type NotationMode = "sharps" | "flats" | "custom"

/** Deriva el mode del desplegable a partir del mapa de notació. */
function modeFromMap(map: AccidentalMap): NotationMode {
  const all = ENHARMONIC_NOTES
  if (all.every((n) => !map[n])) return "sharps"
  if (all.every((n) => map[n])) return "flats"
  return "custom"
}

/** Control de notació enharmònica: desplegable (sostinguts/bemolls/
 *  personalitzat) + 5 toggles per nota negra quan el mode és personalitzat.
 *  Es desa dins pdfOptions.notation i afecta el render (acords + tonalitat)
 *  a la vista prèvia i al PDF. */
export function NotationSection() {
  const t = getT()
  const notation = useSongbookStore((s) => s.pdfOptions.notation)
  const setOpt = useSongbookStore((s) => s.setPdfOption)
  // Marca local: l'usuari ha triat "Personalitzat" explícitament. Cal perquè
  // si els 5 toggles coincideixen amb un preset (tot # o tot b) el mode derivat
  // del mapa tornaria a "sharps"/"flats" i el desplegable saltaria enrere.
  // No es persisteix: en recarregar o reobrir el cançoner es deriva del mapa.
  const [customLocked, setCustomLocked] = useState(false)
  const mode: NotationMode = customLocked ? "custom" : modeFromMap(notation)

  function onModeChange(next: NotationMode) {
    if (next === "sharps") {
      setCustomLocked(false)
      setOpt("notation", ALL_SHARPS)
    } else if (next === "flats") {
      setCustomLocked(false)
      setOpt("notation", ALL_FLATS)
    } else {
      // "custom": manté el mapa actual (hereta l'últim mode) i fixa la marca.
      setCustomLocked(true)
    }
  }

  function toggleNote(note: (typeof ENHARMONIC_NOTES)[number]) {
    setOpt("notation", { ...notation, [note]: !notation[note] })
  }

  return (
    <div className="options-section">
      <label className="opt-row">
        <select
          className="opt-select"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as NotationMode)}
        >
          <option value="sharps">{t.app.songbook.detailPanel.notacioSostinguts}</option>
          <option value="flats">{t.app.songbook.detailPanel.notacioBemolls}</option>
          <option value="custom">{t.app.songbook.detailPanel.notacioPersonalitzat}</option>
        </select>
      </label>
      {mode === "custom" && (
        <div className="accidental-switches">
          {ENHARMONIC_NOTES.map((note) => {
            const isFlat = notation[note]
            return (
              <button
                key={note}
                type="button"
                className={`accidental-switch${isFlat ? " is-flat" : ""}`}
                onClick={() => toggleNote(note)}
                role="switch"
                aria-checked={isFlat}
                title={`${note} ⇄ ${SHARP_TO_FLAT[note]}`}
              >
                <span className="accidental-switch-side accidental-switch-sharp">{note}</span>
                <span className="accidental-switch-side accidental-switch-flat">
                  {SHARP_TO_FLAT[note]}
                </span>
                <span className="accidental-switch-knob" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
