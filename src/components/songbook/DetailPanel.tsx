"use client"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSongbookStore, ALL_MAJOR_KEYS, RELATIVE_MINOR } from "@/hooks/useSongbook"
import { useColumnSizesStore } from "@/hooks/useColumnSizes"
import { SongView } from "@/components/song/SongView"
import { AccentPicker } from "./AccentPicker"
import { getT } from "@/lib/i18n"
import { IconEye, IconSettings, IconShuffle, IconFileText, IconX } from "@/components/shared/Icons"
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
  const t = getT()
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
            <p>{t.app.songbook.detailPanel.seleccionaCanco}</p>
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
  const qrUrl = resolveLinkUrl(
    pdfOptions.qr_platform,
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
  const fontScale = pdfOptions.font_scale
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
              qrUrl={qrUrl}
              notation={pdfOptions.notation}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

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

/* ── ContentSection (Estructura del document) ────────────────
 *  Portada + índex (mateixa fila) + subtítol + salt de pàgina.
 *  Va al panell d'Opcions, no al format del PDF. */

function ContentSection() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <h3 className="options-section-title">{t.app.songbook.detailPanel.estructuraDocument}</h3>
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
      <input
        type="text"
        className="opt-input-text"
        placeholder={t.app.songbook.detailPanel.subtitolPlaceholder}
        disabled={!opts.show_cover}
        value={opts.cover_subtitle ?? ""}
        onChange={(e) => setOpt("cover_subtitle", e.target.value || null)}
        maxLength={200}
      />
      <OptToggle
        checked={opts.page_breaks}
        onChange={(v) => setOpt("page_breaks", v)}
        label={t.app.songbook.detailPanel.saltPaginaEntreCancons}
      />
    </div>
  )
}

/* ── PdfFormatSection ──────────────────────────────────────── */

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

/** Caixa de marges en disposició "rombo" (model de caixa CSS): inputs
 *  als quatre costats d'una caixa interior dibuixada. */
function MarginsBox() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  function marginInput(key: "margin_top" | "margin_bottom" | "margin_left" | "margin_right") {
    return (
      <input
        type="number"
        min={0}
        max={50}
        value={opts[key]}
        onChange={(e) => setOpt(key, Number(e.target.value))}
        aria-label={t.app.songbook.detailPanel[
          key === "margin_top"
            ? "capçalera"
            : key === "margin_bottom"
              ? "peuDePagina"
              : key === "margin_left"
                ? "esquerra"
                : "dreta"
        ]}
      />
    )
  }

  return (
    <div className="margins-box">
      <div className="margins-box-edge margins-box-top">{marginInput("margin_top")}</div>
      <div className="margins-box-edge margins-box-left">{marginInput("margin_left")}</div>
      <div className="margins-box-inner" aria-hidden="true" />
      <div className="margins-box-edge margins-box-right">{marginInput("margin_right")}</div>
      <div className="margins-box-edge margins-box-bottom">{marginInput("margin_bottom")}</div>
    </div>
  )
}

function PdfFormatSection() {
  const t = getT()
  const opts = useSongbookStore((s) => s.pdfOptions)
  const setOpt = useSongbookStore((s) => s.setPdfOption)

  return (
    <div className="options-section">
      <h3 className="options-section-title">{t.app.songbook.detailPanel.estilCanconer}</h3>
      <StyleSelect />

      <h4 className="options-subsection">{t.app.songbook.detailPanel.cos}</h4>
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

      <h4 className="options-subsection">{t.app.songbook.detailPanel.enllacosIQr}</h4>
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

      <h4 className="options-subsection">{t.app.songbook.detailPanel.marges}</h4>
      <MarginsBox />

      <h4 className="options-subsection">{t.app.songbook.detailPanel.formatLlibre}</h4>
      <OptToggle
        checked={opts.book_format}
        onChange={(v) => setOpt("book_format", v)}
        label={t.app.songbook.detailPanel.imprimirDoubleCara}
      />
      <p className="opt-hint">
        Alterna capçaleres i números de pàgina entre les pàgines senars (dreta) i parells
        (esquerra), i afegeix una pàgina en blanc després de l&apos;índex si cal perquè la primera
        cançó comenci a una pàgina senar.
      </p>
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
function NotationSection() {
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
      <h3 className="options-section-title">{t.app.songbook.detailPanel.formatAlteracions}</h3>
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

/* ── OptionsTab ────────────────────────────────────────────── */

function OptionsTab() {
  const t = getT()

  return (
    <div id="tab-options" className="tab-content">
      {/* 1. Estructura del document */}
      <ContentSection />
      <div className="options-sep" />
      {/* 2. Ordre de les cançons */}
      <div className="options-section">
        <h3 className="options-section-title">{t.app.songbook.detailPanel.ordreCancons}</h3>
        <SortControls />
      </div>
      <div className="options-sep" />
      {/* 3. Tonalitats permeses (s'apliquen al fer toggle, sense botó) */}
      <div className="options-section">
        <h3 className="options-section-title">{t.app.songbook.detailPanel.tonalitatPermeses}</h3>
        <KeyFilterGrid />
        <p className="key-filter-hint">{t.app.songbook.detailPanel.tonalitatsPermesesHint}</p>
      </div>
      <div className="options-sep" />
      {/* 4. Format d'alteracions */}
      <NotationSection />
    </div>
  )
}

/* ── PdfFormatFloatingPanel ─────────────────────────────────
 *  Panell flotant amb les opcions de format del PDF. Apareix per
 *  sobre del `#panel-canconer` (col del mig), amb vores arrodonides
 *  i ombra. La resta de la UI queda difuminada (excepte l'AppHeader
 *  i la vista prèvia) perquè l'usuari vegi els canvis en temps real.
 *  Es tanca amb Esc, X, o clicant fora del panell. */

function PdfFormatFloatingPanel({ onClose }: { onClose: () => void }) {
  const t = getT()
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Tancament animat: marquem `closing`, deixem que l'animació de sortida
  // corri i només llavors desmuntem cridant `onClose()` real.
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const requestClose = useCallback(() => {
    if (closeTimer.current != null) return // ja s'està tancant
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 160)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  // Aplica/treu la classe que difumina la resta del layout.
  useEffect(() => {
    document.body.classList.add("pdf-format-overlay-active")
    return () => {
      document.body.classList.remove("pdf-format-overlay-active")
    }
  }, [])

  // Tancar amb Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [requestClose])

  // Click fora del panell flotant → tanca. Atenció a no comptar el clic
  // inicial que l'ha obert (l'event d'obertura ja s'ha consumit perquè
  // l'efecte es registra al següent tick). Tampoc el comptem si el clic
  // és sobre el botó toggle "Format PDF" — d'aquest se n'encarrega el
  // seu `onClick`, que farà el toggle correctament. Si no l'excloíem,
  // el `mousedown` tancaria el panell i el `click` el tornaria a obrir.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const panel = panelRef.current
      if (!panel) return
      const target = e.target as Node
      if (panel.contains(target)) return
      const toggleBtn = document.querySelector(".detail-tab.is-toggle")
      if (toggleBtn && toggleBtn.contains(target)) return
      requestClose()
    }
    // Esperem un tick per no atrapar el mateix clic que obre el panell.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onClick)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onClick)
    }
  }, [requestClose])

  return (
    <div
      ref={panelRef}
      className={`pdf-format-panel${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="false"
    >
      <div className="pdf-format-panel-header">
        <h2 className="pdf-format-panel-title">{t.app.songbook.detailPanel.tabFormatPdf}</h2>
        <button
          className="pdf-format-panel-close"
          onClick={requestClose}
          title={t.app.songbook.detailPanel.tancarFormatPdf}
          aria-label={t.app.songbook.detailPanel.tancarFormatPdf}
        >
          <IconX />
        </button>
      </div>
      <div className="pdf-format-panel-body">
        <PdfFormatSection />
      </div>
    </div>
  )
}

/* ── DetailPanel ───────────────────────────────────────────── */

export function DetailPanel() {
  const t = getT()
  const previewActive = useSongbookStore((s) => s.previewActive)
  const [activeTab, setActiveTab] = useState<"preview" | "options">("preview")
  const [pdfFormatOpen, setPdfFormatOpen] = useState(false)

  return (
    <>
      <section id="panel-detail">
        {previewActive && (
          <div id="panel-detail-inner">
            <div className="detail-tabs">
              <button
                className={`detail-tab${activeTab === "preview" ? " active" : ""}`}
                onClick={() => setActiveTab("preview")}
              >
                <IconEye /> {t.app.songbook.detailPanel.tabVistaPreviа}
              </button>
              <button
                className={`detail-tab${activeTab === "options" ? " active" : ""}`}
                onClick={() => setActiveTab("options")}
              >
                <IconSettings /> {t.app.songbook.detailPanel.tabOpcions}
              </button>
              {/* Visualment una pestanya més (mateixa amplada, alçada,
                  sense vores), però funcionalment és un toggle: obre el
                  panell flotant. Quan està actiu es marca en vermell i
                  la pestanya "Vista prèvia" queda seleccionada darrere. */}
              <button
                type="button"
                className={`detail-tab is-toggle${pdfFormatOpen ? " toggled" : ""}`}
                onClick={() => {
                  if (!pdfFormatOpen) setActiveTab("preview")
                  setPdfFormatOpen((v) => !v)
                }}
                aria-pressed={pdfFormatOpen}
              >
                <IconFileText /> {t.app.songbook.detailPanel.tabFormatPdf}
              </button>
            </div>
            {activeTab === "preview" && <PreviewTab />}
            {activeTab === "options" && <OptionsTab />}
          </div>
        )}
      </section>
      {pdfFormatOpen && <PdfFormatFloatingPanel onClose={() => setPdfFormatOpen(false)} />}
    </>
  )
}

/** Botó flotant per plegar/desplegar la vista prèvia, posicionat
 *  per fora de `#panel-detail` (que té `overflow:auto` i el tallaria).
 *  Quan està plegat, el seu CSS el converteix en `position: fixed` per
 *  flotar a la cantonada dreta del viewport. */
export function PreviewToggleButton() {
  const t = getT()
  const previewActive = useSongbookStore((s) => s.previewActive)
  const togglePreviewActive = useSongbookStore((s) => s.togglePreviewActive)
  return (
    <button
      id="btn-collapse-panel"
      className={`preview-toggle${previewActive ? "" : " collapsed"}`}
      title={previewActive ? t.app.songbook.detailPanel.amagarVistaPreviа : t.app.songbook.detailPanel.mostrarVistaPreviа}
      onClick={togglePreviewActive}
    >
      <span id="collapse-arrow">{previewActive ? "›" : "‹"}</span>
    </button>
  )
}
