"use client"
import { useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { AccentPicker } from "../AccentPicker"
import { CanconerTitleInput } from "../CanconerTitleInput"
import { useOptionsSource } from "./OptionsSource"
import { getT } from "@/lib/i18n"
import { IconShuffle, IconAlignLeft, IconAlignRight } from "@/components/shared/Icons"
import { DelayedTooltip } from "@/components/shared/DelayedTooltip"
import {
  CANCONER_STYLES,
  STYLE_LABELS,
  STYLE_DEFAULT_ACCENTS,
  STYLE_TITLE_FONTS,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
  LINK_PLATFORMS,
  CHORDS_LEFT_WIDTH_MIN,
  CHORDS_LEFT_WIDTH_MAX,
  type CanconerStyle,
  type LinkPlatform,
} from "@/lib/schemas/canconer"
import {
  ENHARMONIC_NOTES,
  ALL_SHARPS,
  ALL_FLATS,
  DEFAULT_ACCIDENTALS,
  SHARP_TO_FLAT,
  type AccidentalMap,
} from "@/lib/transpose"
import type { CSSProperties } from "react"

/* Contingut de cada categoria del panell «Opcions i format». */

/* ── StyleSelect ────────────────────────────────────────── */

function StyleSelect() {
  const t = getT()
  const { style: canconerStyle, setStyle: setCanconerStyle, accentColor, setAccentColor } = useOptionsSource()
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
 *  Substitueix les caselles de verificació clàssiques. Amb `hint`, la
 *  explicació surt en deixar-hi el ratolí 0,5 s (DelayedTooltip). */

function OptToggle({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  hint?: string
}) {
  const row = (
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
  return hint ? <DelayedTooltip text={hint}>{row}</DelayedTooltip> : row
}

/* ── StructureSection (Portada) ──────────────────────────────
 *  Títol + subtítol, i a sota els interruptors de portada i índex. Títol i
 *  subtítol són de l'autor: el diàleg de PDF públic només hi deixa els
 *  interruptors (`editableTexts = false`). */

export function StructureSection({ editableTexts = true }: { editableTexts?: boolean } = {}) {
  const t = getT()
  const { pdfOptions: opts, setPdfOption: setOpt } = useOptionsSource()

  return (
    <div className="options-section">
      {editableTexts && (
        <>
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
        </>
      )}
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
  const { pdfOptions: opts, setPdfOption: setOpt } = useOptionsSource()
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
  const { pdfOptions: opts, setPdfOption: setOpt } = useOptionsSource()

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
        label={t.app.songbook.detailPanel.formatLlibre}
        hint={t.app.songbook.detailPanel.formatLlibreHint}
      />

      <h4 className="options-subsection">{t.app.songbook.detailPanel.marges}</h4>
      <MarginsBox />
    </div>
  )
}

export function LinksSection() {
  const t = getT()
  const { pdfOptions: opts, setPdfOption: setOpt } = useOptionsSource()

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

type NotationMode = "default" | "sharps" | "flats" | "custom"

const NOTATION_PRESETS: Record<Exclude<NotationMode, "custom">, AccidentalMap> = {
  default: DEFAULT_ACCIDENTALS,
  sharps: ALL_SHARPS,
  flats: ALL_FLATS,
}

/** Deriva el mode del desplegable a partir del mapa de notació. */
function modeFromMap(map: AccidentalMap): NotationMode {
  for (const [mode, preset] of Object.entries(NOTATION_PRESETS)) {
    if (ENHARMONIC_NOTES.every((n) => map[n] === preset[n])) return mode as NotationMode
  }
  return "custom"
}

/** Control de notació enharmònica: desplegable (per defecte/sostinguts/
 *  bemolls/personalitzat) + els 5 interruptors per nota negra, sempre
 *  visibles perquè es vegi què fa cada preset. Tocar-ne un passa a
 *  «Personalitzat». Es desa dins pdfOptions.notation i afecta el render
 *  (acords + tonalitat) a la vista prèvia i al PDF. */
export function NotationSection() {
  const t = getT()
  const { pdfOptions, setPdfOption: setOpt } = useOptionsSource()
  const notation = pdfOptions.notation
  // Marca local: l'usuari ha triat "Personalitzat" explícitament. Cal perquè
  // si els 5 toggles coincideixen amb un preset (tot # o tot b) el mode derivat
  // del mapa tornaria a "sharps"/"flats" i el desplegable saltaria enrere.
  // No es persisteix: en recarregar o reobrir el cançoner es deriva del mapa.
  const [customLocked, setCustomLocked] = useState(false)
  const mode: NotationMode = customLocked ? "custom" : modeFromMap(notation)

  function onModeChange(next: NotationMode) {
    if (next === "custom") {
      // Manté el mapa actual (hereta l'últim mode) i fixa la marca.
      setCustomLocked(true)
    } else {
      setCustomLocked(false)
      setOpt("notation", NOTATION_PRESETS[next])
    }
  }

  function toggleNote(note: (typeof ENHARMONIC_NOTES)[number]) {
    setCustomLocked(true)
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
          <option value="default">{t.app.songbook.detailPanel.notacioPerDefecte}</option>
          <option value="sharps">{t.app.songbook.detailPanel.notacioSostinguts}</option>
          <option value="flats">{t.app.songbook.detailPanel.notacioBemolls}</option>
          <option value="custom">{t.app.songbook.detailPanel.notacioPersonalitzat}</option>
        </select>
      </label>
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
    </div>
  )
}

/* ── TwoWaySwitch ───────────────────────────────────────────
 *  Interruptor de dues cares (com els de les alteracions): la cara activa
 *  en color d'accent i el pom a sobre. `value` false = esquerra. */

function TwoWaySwitch({
  left,
  right,
  value,
  onChange,
  disabled,
}: {
  left: string
  right: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`accidental-switch two-way-switch${value ? " is-flat" : ""}`}
      onClick={() => onChange(!value)}
      disabled={disabled}
    >
      <span className="accidental-switch-side accidental-switch-sharp">{left}</span>
      <span className="accidental-switch-side accidental-switch-flat">{right}</span>
      <span className="accidental-switch-knob" aria-hidden="true" />
    </button>
  )
}

/* ── MmField ─────────────────────────────────────────────────
 *  Número en mm. Mentre s'escriu es guarda l'esborrany i només s'aplica
 *  quan és dins del rang (així es pot escriure «12» passant per «1»);
 *  en sortir del camp torna al valor vigent. */

function MmField({
  value,
  min,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled?: boolean
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="opt-num-field" title={label}>
      <input
        type="number"
        className="opt-num-input"
        min={min}
        max={max}
        value={draft ?? value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== "" && v >= min && v <= max) onChange(v)
        }}
        onBlur={() => setDraft(null)}
      />
      <span>mm</span>
    </label>
  )
}

/* ── ChordsSection ─────────────────────────────────────────── */

/** Acords i seccions: glossari i diagrames per cançó, com van els acords al
 *  cos, la notació i els títols de secció. «Només lletra» desactiva el que
 *  depèn dels acords. */
export function ChordsSection() {
  const d = getT().app.songbook.detailPanel
  const { pdfOptions: opts, setPdfOption: setOpt } = useOptionsSource()
  const noChords = opts.lyrics_only
  const alignDisabled = noChords || !opts.chords_left

  return (
    <div className="options-section">
      <div className="switch-row-pair">
        <OptToggle
          checked={opts.chord_glossary}
          onChange={(v) => setOpt("chord_glossary", v)}
          label={d.glossariAcords}
          hint={d.glossariAcordsHint}
          disabled={noChords}
        />
        <OptToggle
          checked={opts.song_chords}
          onChange={(v) => setOpt("song_chords", v)}
          label={d.simbolsCadaCanco}
          hint={d.simbolsCadaCancoHint}
          disabled={noChords}
        />
      </div>
      <OptToggle
        checked={opts.lyrics_only}
        onChange={(v) => setOpt("lyrics_only", v)}
        label={d.nomesLletra}
        hint={d.nomesLletraHint}
      />
      <div className="opt-inline-row">
        <OptToggle
          checked={opts.chords_left}
          onChange={(v) => setOpt("chords_left", v)}
          label={d.acordsEsquerra}
          hint={d.acordsEsquerraHint}
          disabled={noChords}
        />
        <div className="align-btns" role="radiogroup" aria-label={d.alineacioAcords}>
          {(["left", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={opts.chords_left_align === a}
              className={`align-btn${opts.chords_left_align === a ? " active" : ""}`}
              onClick={() => setOpt("chords_left_align", a)}
              disabled={alignDisabled}
              title={a === "left" ? d.alineacioEsquerra : d.alineacioDreta}
              aria-label={a === "left" ? d.alineacioEsquerra : d.alineacioDreta}
            >
              {a === "left" ? <IconAlignLeft /> : <IconAlignRight />}
            </button>
          ))}
        </div>
        <MmField
          value={opts.chords_left_width}
          min={CHORDS_LEFT_WIDTH_MIN}
          max={CHORDS_LEFT_WIDTH_MAX}
          onChange={(v) => setOpt("chords_left_width", v)}
          disabled={alignDisabled}
          label={d.ampladaAcords}
        />
      </div>
      <DelayedTooltip text={d.notacioHint}>
        <div className={`opt-inline-row${noChords ? " is-disabled" : ""}`}>
          <span className="opt-inline-label">{d.notacio}</span>
          <TwoWaySwitch
            left={d.notacioCde}
            right={d.notacioDoReMi}
            value={opts.solfege}
            onChange={(v) => setOpt("solfege", v)}
            disabled={noChords}
          />
        </div>
      </DelayedTooltip>
      <div className="opt-inline-row">
        <OptToggle
          checked={opts.hide_sections}
          onChange={(v) => setOpt("hide_sections", v)}
          label={d.treureSeccions}
          hint={d.treureSeccionsHint}
        />
      </div>
      {opts.hide_sections && (
        <div className="opt-inline-row opt-sub-row">
          <span className="opt-inline-label">{d.tornades}</span>
          <TwoWaySwitch
            left={d.tornadesNegreta}
            right={d.tornadesCursiva}
            value={opts.chorus_style === "italic"}
            onChange={(v) => setOpt("chorus_style", v ? "italic" : "bold")}
          />
        </div>
      )}
    </div>
  )
}
