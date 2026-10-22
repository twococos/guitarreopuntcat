"use client"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { PAGE_W_PX, PREVIEW_GAP_PX } from "@/lib/pdf-client/frame"
import type { PreviewInput } from "@/lib/pdf-client/preview"
import {
  applyPreviewLayout,
  previewLayout,
  PREVIEW_COLS,
  PREVIEW_MIN_ZOOM,
  previewTop,
  type PagePos,
  type PreviewBuild,
  type PreviewLayout,
} from "@/lib/pdf-client/previewLayout"
import { getT } from "@/lib/i18n"
import { IconFitWidth } from "@/components/shared/Icons"

/** Espera després de l'últim canvi abans de refer la prèvia (sliders, títol). */
const REBUILD_DEBOUNCE_MS = 250

/** Zoom relatiu a «ajusta a l'amplada» (1 = la pàgina omple l'amplada). */
const ZOOM_MIN = PREVIEW_MIN_ZOOM
const ZOOM_MAX = 3
const ZOOM_STEP = 1.2

export type PreviewTarget = { kind: "front" } | { kind: "toc" } | { kind: "song"; idx: number }

interface LiveBuild {
  build: PreviewBuild
  /** Contenidor propi de l'iframe dins l'stage (moure un iframe el recarrega). */
  wrapper: HTMLDivElement
  bookFormat: boolean
  layout: PreviewLayout
}

interface Props {
  /** null = no hi ha res a mostrar (es mostra `empty`). Ha de ser estable
   *  (useMemo): cada objecte nou refà la prèvia. */
  input: PreviewInput | null
  /** On anar quan s'incrementa `scrollRequest`. */
  scrollTarget?: PreviewTarget
  scrollRequest?: number
  empty?: ReactNode
  id?: string
  className?: string
  onPageCount?: (n: number | null) => void
  /** Controls de zoom (botons, Ctrl+roda, Ctrl +/−/0). Amb zoom prou
   *  petit es veuen 2, 4 o 8 pàgines alhora (8 és el límit del zoom). */
  zoomable?: boolean
  /** Ctrl +/−/0 a tota la pàgina (diàleg modal). Si no, només amb el
   *  ratolí a sobre de la prèvia, per no prendre el zoom del navegador. */
  globalZoomKeys?: boolean
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/**
 * Vista prèvia del llibret sencer: les pàgines A4 reals del PDF
 * (src/lib/pdf-client/preview.ts), escalades a l'amplada del contenidor.
 *
 * Es refà quan canvia `input`, amb doble memòria intermèdia (el nou iframe
 * es construeix amagat i substitueix l'antic quan és llest) i conservant la
 * posició de lectura. El zoom no la refà: només reescala i recol·loca les
 * pàgines (1 o 2 columnes). La fan servir l'editor de cançoners
 * (BookPreview) i el diàleg de PDF de l'àrea pública.
 */
export function PaginatedPreview({
  input,
  scrollTarget,
  scrollRequest,
  empty,
  id,
  className,
  onPageCount,
  zoomable = false,
  globalZoomKeys = false,
}: Props) {
  const t = getT()
  const tz = t.public.pdfDialog
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(1)
  const liveRef = useRef<LiveBuild | null>(null)
  const buildIdRef = useRef(0)
  /** Hi ha una reconstrucció programada o en curs. */
  const buildingRef = useRef(false)
  /** Petició de scroll arribada mentre es reconstruïa: s'executa en acabar. */
  const pendingScrollRef = useRef(false)
  const targetRef = useRef<PreviewTarget | undefined>(scrollTarget)
  targetRef.current = scrollTarget
  const pageCountRef = useRef(onPageCount)
  pageCountRef.current = onPageCount
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [building, setBuilding] = useState(false)
  const [failed, setFailed] = useState(false)

  const hasItems = input !== null

  /** Escala i columnes per a l'amplada actual i el zoom. */
  const measure = useCallback((pageCount: number, bookFormat: boolean) => {
    const el = viewportRef.current
    if (!el) return null
    const styles = getComputedStyle(el)
    const padX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0")
    const inner = Math.max(0, el.clientWidth - padX)
    if (inner <= 0) return null
    const scale = (inner / PAGE_W_PX) * (zoomable ? zoomRef.current : 1)
    // Tantes columnes com hi càpiguen (8, 4 o 2), si hi ha prou pàgines per omplir-les
    const cols = !zoomable
      ? 1
      : (PREVIEW_COLS.find(
          (c) => c === 1 || (pageCount >= c && scale * (c * PAGE_W_PX + (c - 1) * PREVIEW_GAP_PX) <= inner + 0.5),
        ) ?? 1)
    return { scale, cols, bookFormat }
  }, [zoomable])

  /** Aplica escala i disposició a l'iframe visible, conservant el punt de lectura. */
  const relayout = useCallback(
    (keepPosition = true) => {
      const live = liveRef.current
      const stage = stageRef.current
      const viewport = viewportRef.current
      if (!stage) return
      if (!live) {
        stage.style.height = "0px"
        stage.style.width = ""
        return
      }
      const m = measure(live.build.pageCount, live.bookFormat)
      if (!m) return
      const oldHeight = live.layout.height * scaleRef.current
      const ratio = viewport && oldHeight > 0 ? viewport.scrollTop / oldHeight : 0
      const layout = previewLayout(live.build.pageCount, m.cols, live.bookFormat)
      if (layout.cols !== live.layout.cols || layout.spreadOffset !== live.layout.spreadOffset) {
        applyPreviewLayout(live.build, layout)
      }
      live.layout = layout
      scaleRef.current = m.scale
      stage.style.height = `${layout.height * m.scale}px`
      stage.style.width = `${layout.width * m.scale}px`
      live.build.frame.iframe.style.transform = `scale(${m.scale})`
      if (viewport && keepPosition) viewport.scrollTop = ratio * layout.height * m.scale
    },
    [measure],
  )

  /** Va a `scrollTarget`: l'inici del llibret, l'índex o una cançó. */
  const scrollToTarget = useCallback(() => {
    const viewport = viewportRef.current
    const live = liveRef.current
    const target = targetRef.current
    if (!viewport || !live || !target) return
    const pos: PagePos | null =
      target.kind === "front"
        ? { pageIdx: 0, offset: 0 }
        : target.kind === "toc"
          ? { pageIdx: live.build.tocPage ?? 0, offset: 0 }
          : (live.build.songStarts[target.idx] ?? null)
    if (!pos) return
    viewport.scrollTo({ top: previewTop(pos, live.layout) * scaleRef.current, behavior: "smooth" })
  }, [])

  // Reescala quan canvia l'amplada del contenidor o el zoom. Doble rAF per
  // mesurar amb el layout ja resolt.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const run = () => relayout()
    run()
    const raf1 = requestAnimationFrame(() => {
      run()
      requestAnimationFrame(run)
    })
    const ro = new ResizeObserver(run)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf1)
      ro.disconnect()
    }
  }, [relayout, zoom])

  /** Substitueix la prèvia visible per la nova, conservant la posició. */
  const swap = useCallback(
    (build: PreviewBuild, wrapper: HTMLDivElement, bookFormat: boolean) => {
      const viewport = viewportRef.current
      const prev = liveRef.current
      const scale = scaleRef.current
      // Àncora: la cançó que comença just abans del punt de lectura.
      let anchor: { k: number; delta: number } | null = null
      if (viewport && prev) {
        const y = viewport.scrollTop / scale
        let k = -1
        for (let i = 0; i < prev.build.songStarts.length; i++) {
          if (previewTop(prev.build.songStarts[i], prev.layout) <= y) k = i
          else break
        }
        if (k >= 0) anchor = { k, delta: y - previewTop(prev.build.songStarts[k], prev.layout) }
      }
      const prevTop = viewport?.scrollTop ?? 0
      liveRef.current = { build, wrapper, bookFormat, layout: previewLayout(build.pageCount, 1, bookFormat) }
      relayout(false)
      wrapper.style.visibility = ""
      if (prev) {
        prev.build.frame.destroy()
        prev.wrapper.remove()
      }
      const live = liveRef.current
      if (viewport && live) {
        const s = scaleRef.current
        const next =
          anchor && anchor.k < build.songStarts.length
            ? (previewTop(build.songStarts[anchor.k], live.layout) + anchor.delta) * s
            : prevTop
        viewport.scrollTop = Math.min(next, Math.max(0, live.layout.height * s))
      }
      pageCountRef.current?.(build.pageCount)
    },
    [relayout],
  )

  // Reconstrucció (declarat abans de l'efecte de scroll: en afegir una
  // cançó, quan s'executa aquell, `buildingRef` ja és cert).
  useEffect(() => {
    const id = ++buildIdRef.current
    if (!input) {
      const live = liveRef.current
      if (live) {
        live.build.frame.destroy()
        live.wrapper.remove()
        liveRef.current = null
      }
      relayout()
      buildingRef.current = false
      pendingScrollRef.current = false
      setBuilding(false)
      setFailed(false)
      pageCountRef.current?.(null)
      return
    }
    buildingRef.current = true
    setBuilding(true)
    const timer = window.setTimeout(async () => {
      const stage = stageRef.current
      if (!stage) return
      const wrapper = document.createElement("div")
      wrapper.className = "book-preview-buffer"
      wrapper.style.visibility = "hidden"
      stage.appendChild(wrapper)
      try {
        const { buildPreview } = await import("@/lib/pdf-client/preview")
        const build = await buildPreview(input, wrapper)
        if (id !== buildIdRef.current) {
          build.frame.destroy()
          wrapper.remove()
          return
        }
        swap(build, wrapper, input.options.book_format)
        buildingRef.current = false
        setBuilding(false)
        setFailed(false)
        if (pendingScrollRef.current) {
          pendingScrollRef.current = false
          scrollToTarget()
        }
      } catch (err) {
        wrapper.remove()
        if (id !== buildIdRef.current) return
        console.error("Error generant la vista prèvia:", err)
        buildingRef.current = false
        setBuilding(false)
        setFailed(true)
      }
    }, REBUILD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [input, relayout, swap, scrollToTarget])

  // Anar a l'objectiu quan es demana.
  useEffect(() => {
    if (scrollRequest === undefined) return
    if (buildingRef.current || !liveRef.current) pendingScrollRef.current = true
    else scrollToTarget()
  }, [scrollRequest, scrollToTarget])

  /** Torna a «la pàgina omple l'amplada» i centra el llibret. */
  const fitWidth = useCallback(() => {
    setZoom(1)
    requestAnimationFrame(() => {
      const el = viewportRef.current
      if (el) el.scrollLeft = 0
    })
  }, [])

  // Zoom amb Ctrl+roda (sobre la prèvia) i Ctrl +/−/0 (a tota la pàgina)
  useEffect(() => {
    if (!zoomable) return
    const el = viewportRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => clampZoom(z * Math.pow(1.0015, -e.deltaY)))
    }
    let hovered = false
    const onEnter = () => (hovered = true)
    const onLeave = () => (hovered = false)
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (!globalZoomKeys && !hovered) return
      if (e.key === "+" || e.key === "=") setZoom((z) => clampZoom(z * ZOOM_STEP))
      else if (e.key === "-") setZoom((z) => clampZoom(z / ZOOM_STEP))
      else if (e.key === "0") fitWidth()
      else return
      e.preventDefault()
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointerleave", onLeave)
    document.addEventListener("keydown", onKey)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerenter", onEnter)
      el.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("keydown", onKey)
    }
  }, [zoomable, globalZoomKeys, fitWidth])

  // En desmuntar: descarta la reconstrucció en curs i treu els iframes.
  useEffect(() => {
    return () => {
      buildIdRef.current++
      const live = liveRef.current
      if (live) {
        live.build.frame.destroy()
        live.wrapper.remove()
        liveRef.current = null
      }
    }
  }, [])

  return (
    <div id={id} className={className}>
      <div className={`preview-viewport${zoomable ? " is-zoomable" : ""}`} ref={viewportRef}>
        {!hasItems && empty}
        {hasItems && failed && !liveRef.current && (
          <div className="empty-state">
            <p>{t.app.songbook.detailPanel.errorPrevia}</p>
          </div>
        )}
        <div className="book-preview-stage" ref={stageRef} />
      </div>
      <div className={`book-preview-status${building && hasItems ? " is-visible" : ""}`} aria-live="polite">
        {building && hasItems ? t.app.songbook.detailPanel.actualitzantPrevia : ""}
      </div>
      {zoomable && hasItems && (
        <div className="preview-zoom" role="group" aria-label={tz.zoom}>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
            disabled={zoom <= ZOOM_MIN}
            aria-label={tz.allunya}
            title={`${tz.allunya} (Ctrl −)`}
          >
            −
          </button>
          <span className="preview-zoom-value" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
            aria-label={tz.apropa}
            title={`${tz.apropa} (Ctrl +)`}
          >
            +
          </button>
          <span className="preview-zoom-sep" aria-hidden="true" />
          <button
            type="button"
            onClick={fitWidth}
            aria-label={tz.ajusta}
            title={`${tz.ajusta} (Ctrl 0)`}
          >
            <IconFitWidth />
          </button>
        </div>
      )}
    </div>
  )
}
