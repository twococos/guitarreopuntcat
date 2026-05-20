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
  type CanconerStyle,
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
