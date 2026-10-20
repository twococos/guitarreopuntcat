"use client"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useColumnSizesStore } from "@/hooks/useColumnSizes"
import { PAGE_W_PX } from "@/lib/pdf-client/frame"
import type { PreviewBuild } from "@/lib/pdf-client/preview"
import { getT } from "@/lib/i18n"

/** Espera després de l'últim canvi abans de refer la prèvia (sliders, títol). */
const REBUILD_DEBOUNCE_MS = 250

interface LiveBuild {
  build: PreviewBuild
  /** Contenidor propi de l'iframe dins l'stage (moure un iframe el recarrega). */
  wrapper: HTMLDivElement
}

/**
 * Vista prèvia del llibret sencer: les pàgines A4 reals del PDF
 * (src/lib/pdf-client/preview.ts), escalades a l'amplada de la columna.
 *
 * Es refà quan canvien les cançons o les opcions, amb doble memòria
 * intermèdia (el nou iframe es construeix amagat i substitueix l'antic
 * quan és llest) i conservant la posició de lectura. Seleccionar una
 * cançó només hi fa scroll.
 */
export function BookPreview() {
  const t = getT()
  const canconer = useSongbookStore((s) => s.canconer)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  const previewScrollRequest = useSongbookStore((s) => s.previewScrollRequest)
  // Tick perquè l'escala també respongui als canvis d'amplada del store.
  const rightWidth = useColumnSizesStore((s) => s.rightWidth)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(1)
  const liveRef = useRef<LiveBuild | null>(null)
  const buildIdRef = useRef(0)
  /** Hi ha una reconstrucció programada o en curs. */
  const buildingRef = useRef(false)
  /** Petició de scroll arribada mentre es reconstruïa: s'executa en acabar. */
  const pendingScrollRef = useRef(false)
  const [building, setBuilding] = useState(false)
  const [failed, setFailed] = useState(false)

  const hasItems = canconer.length > 0

  /** Aplica l'escala a l'iframe visible i l'alçada escalada a l'stage. */
  const applyScale = useCallback(() => {
    const live = liveRef.current
    const stage = stageRef.current
    const scale = scaleRef.current
    if (stage) stage.style.height = live ? `${live.build.height * scale}px` : "0px"
    if (live) live.build.frame.iframe.style.transform = `scale(${scale})`
  }, [])

  /** Va a `previewTarget` del store: l'inici del llibret o una cançó. */
  const scrollToTarget = useCallback(() => {
    const viewport = viewportRef.current
    const live = liveRef.current
    if (!viewport || !live) return
    const target = useSongbookStore.getState().previewTarget
    const top =
      target.kind === "front"
        ? 0
        : target.kind === "toc"
          ? (live.build.tocTop ?? 0)
          : live.build.songTops[target.idx]
    if (top === undefined) return
    viewport.scrollTo({ top: top * scaleRef.current, behavior: "smooth" })
  }, [])

  // Escala perquè la pàgina A4 ocupi exactament l'amplada útil del panell.
  // Doble rAF per mesurar amb el layout ja resolt.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function compute() {
      if (!el) return
      const styles = getComputedStyle(el)
      const padX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0")
      const inner = Math.max(0, el.clientWidth - padX)
      if (inner <= 0) return
      const next = inner / PAGE_W_PX
      if (Math.abs(next - scaleRef.current) < 1e-4) return
      // Mantenim el punt de lectura en canviar el zoom.
      const ratio = next / scaleRef.current
      scaleRef.current = next
      applyScale()
      el.scrollTop = el.scrollTop * ratio
    }
    compute()
    const raf1 = requestAnimationFrame(() => {
      compute()
      requestAnimationFrame(compute)
    })
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf1)
      ro.disconnect()
    }
  }, [rightWidth, applyScale])

  /** Substitueix la prèvia visible per la nova, conservant la posició. */
  const swap = useCallback(
    (build: PreviewBuild, wrapper: HTMLDivElement) => {
      const viewport = viewportRef.current
      const prev = liveRef.current
      const scale = scaleRef.current
      let nextTop = viewport?.scrollTop ?? 0
      if (viewport && prev) {
        // Àncora: la cançó que comença just abans del punt de lectura.
        const y = viewport.scrollTop / scale
        let k = -1
        for (let i = 0; i < prev.build.songTops.length; i++) {
          if (prev.build.songTops[i] <= y) k = i
          else break
        }
        if (k >= 0 && k < build.songTops.length) {
          nextTop = (build.songTops[k] + (y - prev.build.songTops[k])) * scale
        }
      }
      liveRef.current = { build, wrapper }
      applyScale()
      wrapper.style.visibility = ""
      if (prev) {
        prev.build.frame.destroy()
        prev.wrapper.remove()
      }
      if (viewport) viewport.scrollTop = Math.min(nextTop, Math.max(0, build.height * scale))
    },
    [applyScale],
  )

  // Reconstrucció (declarat abans de l'efecte de scroll: en afegir una
  // cançó, quan s'executa aquell, `buildingRef` ja és cert).
  useEffect(() => {
    const id = ++buildIdRef.current
    if (!hasItems) {
      const live = liveRef.current
      if (live) {
        live.build.frame.destroy()
        live.wrapper.remove()
        liveRef.current = null
      }
      applyScale()
      buildingRef.current = false
      pendingScrollRef.current = false
      setBuilding(false)
      setFailed(false)
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
        const { buildPreview, entriesToPdfSongs } = await import("@/lib/pdf-client/preview")
        const build = await buildPreview(
          {
            title: canconerTitle || "El meu cançoner",
            style: canconerStyle,
            accentColor,
            options: pdfOptions,
            songs: entriesToPdfSongs(canconer),
          },
          wrapper,
        )
        if (id !== buildIdRef.current) {
          build.frame.destroy()
          wrapper.remove()
          return
        }
        swap(build, wrapper)
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
  }, [canconer, canconerTitle, canconerStyle, accentColor, pdfOptions, hasItems, applyScale, swap, scrollToTarget])

  // Anar a l'objectiu quan es demana (clic a la llista, alta, panell d'opcions).
  useEffect(() => {
    if (buildingRef.current || !liveRef.current) pendingScrollRef.current = true
    else scrollToTarget()
  }, [previewScrollRequest, scrollToTarget])

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
    <div id="tab-preview" className="tab-content active">
      <div className="preview-viewport" ref={viewportRef}>
        {!hasItems && (
          <div id="detail-empty" className="empty-state">
            <span>←</span>
            <p>{t.app.songbook.detailPanel.previaBuida}</p>
          </div>
        )}
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
    </div>
  )
}
