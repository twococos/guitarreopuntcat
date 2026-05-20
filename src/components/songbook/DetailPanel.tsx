"use client"
import { useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { transposeKey, transposeContent } from "@/lib/transpose"

/* ── PreviewTab ────────────────────────────────────────────── */

function PreviewTab() {
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const bumpSemitones = useSongbookStore((s) => s.bumpSemitones)

  const entry = selectedIdx != null ? canconer[selectedIdx] : undefined

  if (!entry) {
    return (
      <div id="detail-empty" className="empty-state">
        <span>←</span>
        <p>Selecciona una cançó del cançoner</p>
      </div>
    )
  }

  const { song, semitones } = entry
  const transposedKey = transposeKey(song.key, semitones)
  const transposedContent = transposeContent(song.content, semitones)

  return (
    <div id="tab-preview" className="tab-content active">
      <div id="detail-content">
        <div className="detail-header">
          <div>
            <h2 id="detail-title">{song.title}</h2>
            <p id="detail-meta">
              {song.artist} · To original: {song.key}
              {song.capo ? ` · Cejilla: ${song.capo}` : ""}
            </p>
          </div>
          <div className="transpose-control">
            <label>To</label>
            <div className="transpose-buttons">
              <button id="btn-down" onClick={() => bumpSemitones(selectedIdx!, -1)}>
                −
              </button>
              <span id="transpose-value">
                {(semitones >= 0 ? "+" : "") + semitones}
              </span>
              <button id="btn-up" onClick={() => bumpSemitones(selectedIdx!, 1)}>
                +
              </button>
            </div>
            <small id="display-key">→ {transposedKey}</small>
          </div>
        </div>
        <div
          id="detail-body"
          dangerouslySetInnerHTML={{ __html: transposedContent }}
        />
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
