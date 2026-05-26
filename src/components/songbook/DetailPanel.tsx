"use client"
import { useLayoutEffect, useRef, useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { useColumnSizesStore } from "@/hooks/useColumnSizes"
import { useToastStore } from "@/hooks/useToasts"
import { SongView } from "@/components/song/SongView"
import { AccentPicker } from "./AccentPicker"
import {
  CANCONER_STYLES,
  STYLE_LABELS,
  STYLE_DEFAULT_ACCENTS,
  FONT_SCALES,
  FONT_SCALE_LABELS,
  FONT_SCALE_FACTORS,
  type CanconerStyle,
  type FontScale,
} from "@/lib/schemas/canconer"
import type { CSSProperties } from "react"

/** Conversions per dimensionar la pàgina A4 a la preview.
 *  El PDF s'imprimeix a A4 (210×297mm). Aquí dibuixem el mateix
 *  a 96 dpi (1mm ≈ 3.7795px). */
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const PX_PER_MM = 96 / 25.4
const A4_WIDTH_PX = A4_WIDTH_MM * PX_PER_MM
const A4_HEIGHT_PX = A4_HEIGHT_MM * PX_PER_MM

/** Espai reservat per a la capçalera/peu de pàgina al PDF (mm).
 *  Mirroreja les constants HEADER_AREA_MM / FOOTER_AREA_MM de
 *  src/lib/pdf/styles.ts perquè la preview tingui els mateixos
 *  marges efectius que el PDF generat. */
const HEADER_AREA_MM = 12
const FOOTER_AREA_MM = 10

/* ── PreviewTab ────────────────────────────────────────────── */

function resolveLinkUrl(
  platform: "none" | "youtube" | "spotify",
  yt: string | null,
  sp: string | null,
): string | null {
  if (platform === "none") return null
  if (platform === "youtube") return yt ?? sp ?? null
  return sp ?? yt ?? null
}

function PreviewTab() {
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  // L'amplada de la columna dreta es persisteix al store de mides; usem-lo com
  // a "tick" perquè el càlcul d'escala també respongui a canvis del store
  // (per si el ResizeObserver no es dispara per algun motiu en certs entorns).
  const rightWidth = useColumnSizesStore((s) => s.rightWidth)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  const entry = selectedIdx != null ? canconer[selectedIdx] : undefined

  // Calcula l'escala perquè la pàgina A4 encaixi exactament a l'amplada
  // del contenidor visible. S'amplia si el panell és més ample que A4
  // i es redueix si és més estret. Recalcula amb ResizeObserver i també
  // amb un doble rAF al primer render per assegurar que el layout està
  // ja resolt quan mesurem.
  //
  // Depèn de `entry?.song.id` perquè quan se selecciona la primera cançó,
  // el `.preview-viewport` es munta i necessitem mesurar de nou.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function compute() {
      if (!el) return
      const styles = getComputedStyle(el)
      const padX =
        parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0")
      const inner = Math.max(0, el.clientWidth - padX)
      if (inner > 0) setScale(inner / A4_WIDTH_PX)
    }
    compute()
    const raf1 = requestAnimationFrame(() => {
      compute()
      // Segon rAF: després del primer paint complet
      requestAnimationFrame(compute)
    })
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf1)
      ro.disconnect()
    }
  }, [rightWidth, entry?.song.id])

  if (!entry) {
    return (
      <div id="tab-preview" className="tab-content active">
        <div className="preview-viewport" ref={viewportRef}>
          <div id="detail-empty" className="empty-state">
            <span>←</span>
            <p>Selecciona una cançó del cançoner</p>
          </div>
        </div>
      </div>
    )
  }

  // L'API retorna snake_case (mapSong). Tot i que el tipus `Song` diu
  // camelCase, els fields reals al runtime són snake_case. Llegim-los així.
  const songLike = entry.song as unknown as {
    youtube_url: string | null
    spotify_url: string | null
  }
  const linkUrl = resolveLinkUrl(
    pdfOptions.link_platform,
    songLike.youtube_url,
    songLike.spotify_url,
  )

  // Marges efectius del PDF (en mm). Mateixos càlculs que styles.ts:
  // marge usuari + zona reservada per a la capçalera/peu (que pdf-lib pinta).
  const padTopMm = pdfOptions.margin_top + HEADER_AREA_MM
  const padBottomMm = pdfOptions.margin_bottom + FOOTER_AREA_MM
  const padLeftMm = pdfOptions.margin_left
  const padRightMm = pdfOptions.margin_right

  const pageInlineStyle: CSSProperties = {
    width: `${A4_WIDTH_PX}px`,
    minHeight: `${A4_HEIGHT_PX}px`,
    paddingTop: `${padTopMm}mm`,
    paddingBottom: `${padBottomMm}mm`,
    paddingLeft: `${padLeftMm}mm`,
    paddingRight: `${padRightMm}mm`,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  }
  const accentStyle = accentColor
    ? ({ "--accent": accentColor } as CSSProperties)
    : undefined
  const fontScale = FONT_SCALE_FACTORS[pdfOptions.font_scale]
  const pageVars = {
    "--pdf-cols": pdfOptions.columns,
    "--pdf-font-scale": fontScale,
    ...accentStyle,
  } as CSSProperties

  // L'alçada del wrapper extern és l'alçada A4 × scale (perquè el
  // transform: scale no afecta el flow). Així evitem espai en blanc
  // a sota i obtenim un scroll vertical correcte.
  const scaledHeightPx = A4_HEIGHT_PX * scale

  return (
    <div id="tab-preview" className="tab-content active">
      <div className="preview-viewport" ref={viewportRef}>
        <div className="preview-scaler" style={{ height: scaledHeightPx }}>
          <div
            className="preview-page song-page"
            data-style={canconerStyle}
            style={{ ...pageInlineStyle, ...pageVars }}
          >
            <SongView
              song={entry.song}
              semitones={entry.semitones}
              number={selectedIdx! + 1}
              styleVariant={canconerStyle}
              accentColor={accentColor}
              titleLinkUrl={linkUrl}
              qrUrl={pdfOptions.show_qr ? linkUrl : null}
            />
          </div>
        </div>
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

      <h4 className="options-subsection">Enllaços i QR</h4>
      <label className="opt-row">
        <span>Enllaç clicable:</span>
        <select
          className="opt-select"
          value={opts.link_platform}
          onChange={(e) =>
            setOpt(
              "link_platform",
              e.target.value as "none" | "youtube" | "spotify",
            )
          }
        >
          <option value="none">Cap</option>
          <option value="youtube">YouTube</option>
          <option value="spotify">Spotify</option>
        </select>
      </label>
      <p className="opt-hint">
        En clicar la capçalera d&apos;una cançó al PDF s&apos;obrirà l&apos;enllaç de la plataforma triada
        (amb fallback automàtic a l&apos;altra si una cançó no en té).
      </p>
      <label className="opt-row">
        <input
          type="checkbox"
          checked={opts.show_qr}
          onChange={(e) => setOpt("show_qr", e.target.checked)}
          disabled={opts.link_platform === "none"}
        />
        <span>Mostrar codi QR a cada capçalera</span>
      </label>
      <p className="opt-hint">
        Genera un QR a la dreta de la capçalera apuntant al mateix enllaç. Útil per a la versió impresa.
      </p>
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
  const [activeTab, setActiveTab] = useState<"preview" | "options">("preview")

  return (
    <section id="panel-detail">
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

/** Botó flotant per plegar/desplegar la vista prèvia, posicionat
 *  per fora de `#panel-detail` (que té `overflow:auto` i el tallaria).
 *  Quan està plegat, el seu CSS el converteix en `position: fixed` per
 *  flotar a la cantonada dreta del viewport. */
export function PreviewToggleButton() {
  const previewActive = useSongbookStore((s) => s.previewActive)
  const togglePreviewActive = useSongbookStore((s) => s.togglePreviewActive)
  return (
    <button
      id="btn-collapse-panel"
      className={`preview-toggle${previewActive ? "" : " collapsed"}`}
      title={previewActive ? "Amagar vista prèvia" : "Mostrar vista prèvia"}
      onClick={togglePreviewActive}
    >
      <span id="collapse-arrow">{previewActive ? "›" : "‹"}</span>
    </button>
  )
}
