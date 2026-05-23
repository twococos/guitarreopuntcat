"use client"
import { useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { SongView } from "@/components/song/SongView"
import { AccentPicker } from "./AccentPicker"
import {
  CANCONER_STYLES,
  STYLE_LABELS,
  STYLE_DEFAULT_ACCENTS,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  type CanconerStyle,
  type FontScale,
} from "@/lib/schemas/canconer"
import type { CSSProperties } from "react"

/* ── PreviewTab ────────────────────────────────────────────── */

function PreviewTab() {
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)

  const entry = selectedIdx != null ? canconer[selectedIdx] : undefined

  if (!entry) {
    return (
      <div id="detail-empty" className="empty-state">
        <span>←</span>
        <p>Selecciona una cançó del cançoner</p>
      </div>
    )
  }

  const inlineStyle = accentColor
    ? ({ "--accent": accentColor } as CSSProperties)
    : undefined

  return (
    <div id="tab-preview" className="tab-content active">
      <div id="detail-content" data-style={canconerStyle} style={inlineStyle}>
        <SongView
          song={entry.song}
          semitones={entry.semitones}
          number={selectedIdx! + 1}
          styleVariant={canconerStyle}
          accentColor={accentColor}
        />
      </div>
    </div>
  )
}

/* ── StyleSelect ────────────────────────────────────────── */

function StyleSelect() {
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
      >
        {CANCONER_STYLES.map((s) => (
          <option key={s} value={s}>
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
          title="Color d'accent"
          aria-label="Color d'accent"
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
        <option value="custom">Personalitzat</option>
        <option value="title">Per títol</option>
        <option value="artist">Per artista i títol</option>
        <option value="random">Al·leatori</option>
      </select>
      {(sortMode === "title" || sortMode === "artist") && (
        <button
          id="btn-sort-dir"
          className="btn-sort-extra"
          title="Canviar ordre"
          onClick={toggleSortDir}
        >
          <span id="sort-dir-icon">{sortAsc ? "↑" : "↓"}</span>
        </button>
      )}
      {sortMode === "random" && (
        <button
          id="btn-sort-random"
          className="btn-sort-extra"
          title="Tornar a aleatoritzar"
          onClick={reshuffle}
        >
          🎲
        </button>
      )}
    </div>
  )
}

/* ── KeyFilterGrid ─────────────────────────────────────────── */

function KeyFilterGrid() {
  const allowedKeys = useSongbookStore((s) => s.allowedKeys)
  const toggleAllowedKey = useSongbookStore((s) => s.toggleAllowedKey)

  return (
    <div id="key-filter-grid" className="key-filter-grid">
      {ALL_MAJOR_KEYS.map((key) => (
        <button
          key={key}
          className={`key-filter-btn${allowedKeys.has(key) ? " active" : ""}`}
          title={`${key} major / ${RELATIVE_MINOR[key]}`}
          onClick={() => toggleAllowedKey(key)}
        >
          <span className="kf-major">{key}</span>
          <span className="kf-minor">{RELATIVE_MINOR[key]}</span>
        </button>
      ))}
    </div>
  )
}

/* ── PdfFormatSection ──────────────────────────────────────── */

function PdfFormatSection() {
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <h3 className="options-section-title">Format PDF</h3>

      <h4 className="options-subsection">Portada</h4>
      <label className="opt-row">
        <input
          type="checkbox"
          checked={opts.show_cover}
          onChange={(e) => setOpt("show_cover", e.target.checked)}
        />
        <span>Mostrar portada</span>
      </label>
      <input
        type="text"
        className="opt-input-text"
        placeholder="Subtítol (opcional)"
        disabled={!opts.show_cover}
        value={opts.cover_subtitle ?? ""}
        onChange={(e) => setOpt("cover_subtitle", e.target.value || null)}
        maxLength={200}
      />

      <h4 className="options-subsection">Índex</h4>
      <label className="opt-row">
        <input
          type="checkbox"
          checked={opts.show_index}
          onChange={(e) => setOpt("show_index", e.target.checked)}
        />
        <span>Mostrar índex</span>
      </label>

      <h4 className="options-subsection">Cos</h4>
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
      <label className="opt-row">
        <span>Mida lletra:</span>
        <select
          className="opt-select"
          value={opts.font_scale}
          onChange={(e) => setOpt("font_scale", e.target.value as FontScale)}
        >
          {FONT_SCALES.map((s) => (
            <option key={s} value={s}>
              {FONT_SCALE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="opt-row">
        <input
          type="checkbox"
          checked={opts.page_breaks}
          onChange={(e) => setOpt("page_breaks", e.target.checked)}
        />
        <span>Salt de pàgina entre cançons</span>
      </label>

      <h4 className="options-subsection">Format llibre</h4>
      <label className="opt-row">
        <input
          type="checkbox"
          checked={opts.book_format}
          onChange={(e) => setOpt("book_format", e.target.checked)}
        />
        <span>Imprimir a doble cara</span>
      </label>
      <p className="opt-hint">
        Alterna capçaleres i números de pàgina entre les pàgines senars (dreta) i parells
        (esquerra), i afegeix una pàgina en blanc després de l&apos;índex si cal perquè la primera
        cançó comenci a una pàgina senar.
      </p>

      <h4 className="options-subsection">Marges (mm)</h4>
      <div className="pdf-margins-grid">
        <label className="opt-margin">
          <span>Capçalera</span>
          <input
            type="number"
            min={0}
            max={50}
            value={opts.margin_top}
            onChange={(e) => setOpt("margin_top", Number(e.target.value))}
          />
        </label>
        <label className="opt-margin">
          <span>Peu de pàgina</span>
          <input
            type="number"
            min={0}
            max={50}
            value={opts.margin_bottom}
            onChange={(e) => setOpt("margin_bottom", Number(e.target.value))}
          />
        </label>
        <label className="opt-margin">
          <span>Esquerra</span>
          <input
            type="number"
            min={0}
            max={50}
            value={opts.margin_left}
            onChange={(e) => setOpt("margin_left", Number(e.target.value))}
          />
        </label>
        <label className="opt-margin">
          <span>Dreta</span>
          <input
            type="number"
            min={0}
            max={50}
            value={opts.margin_right}
            onChange={(e) => setOpt("margin_right", Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  )
}

/* ── OptionsTab ────────────────────────────────────────────── */

function OptionsTab() {
  const canconer = useSongbookStore((s) => s.canconer)
  const applyAllowedKeys = useSongbookStore((s) => s.applyAllowedKeys)
  const showToast = useToastStore((s) => s.show)

  function applyAndToast() {
    if (canconer.length === 0) return
    applyAllowedKeys()
    showToast("Tonalitats aplicades!")
  }

  return (
    <div id="tab-options" className="tab-content">
      <div className="options-section">
        <h3 className="options-section-title">Estil del cançoner</h3>
        <StyleSelect />
      </div>
      <div className="options-sep" />
      <div className="options-section">
        <h3 className="options-section-title">Ordenació</h3>
        <SortControls />
      </div>
      <div className="options-sep" />
      <div className="options-section">
        <h3 className="options-section-title">Tonalitats permeses</h3>
        <KeyFilterGrid />
        <p className="key-filter-hint">
          Les cançons en tonalitats desactivades es transposaran a la més propera en aplicar. Si
          reactiveu una tonalitat, les cançons que hi eren originalment recuperen el to original.
        </p>
        <button id="btn-apply-keys" className="btn-apply-keys" onClick={applyAndToast}>
          Aplicar
        </button>
      </div>
      <div className="options-sep" />
      <PdfFormatSection />
    </div>
  )
}

/* ── DetailPanel ───────────────────────────────────────────── */

export function DetailPanel() {
  const previewActive = useSongbookStore((s) => s.previewActive)
  const togglePreviewActive = useSongbookStore((s) => s.togglePreviewActive)
  const [activeTab, setActiveTab] = useState<"preview" | "options">("preview")

  return (
    <section id="panel-detail">
      <button
        id="btn-collapse-panel"
        className="btn-collapse"
        title="Amagar/mostrar panell"
        onClick={togglePreviewActive}
      >
        <span id="collapse-arrow">{previewActive ? "›" : "‹"}</span>
      </button>
      {previewActive && (
        <div id="panel-detail-inner">
          <div className="detail-tabs">
            <button
              className={`detail-tab${activeTab === "preview" ? " active" : ""}`}
              onClick={() => setActiveTab("preview")}
            >
              👁 Vista prèvia
            </button>
            <button
              className={`detail-tab${activeTab === "options" ? " active" : ""}`}
              onClick={() => setActiveTab("options")}
            >
              ⚙ Opcions
            </button>
          </div>
          {activeTab === "preview" && <PreviewTab />}
          {activeTab === "options" && <OptionsTab />}
        </div>
      )}
    </section>
  )
}
