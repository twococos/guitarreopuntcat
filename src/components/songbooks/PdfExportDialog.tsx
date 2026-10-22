"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import type { PdfSong } from "@/lib/pdf-client/types"
import { PaginatedPreview, type PreviewTarget } from "@/components/shared/PaginatedPreview"
import { OptionsAccordion, type AccordionCategory } from "@/components/songbook/options/OptionsAccordion"
import { OptionsSourceProvider, type OptionsSourceValue } from "@/components/songbook/options/OptionsSource"
import {
  StructureSection,
  StyleSection,
  BodySection,
  NotationSection,
  LinksSection,
} from "@/components/songbook/options/sections"
import { IconChevronRight, IconClock, IconFileText, IconX } from "@/components/shared/Icons"

type DialogCategoryId = "structure" | "style" | "body" | "notation" | "links"

/** Portada sense títol ni subtítol: al visor públic són de l'autor. */
function CoverSection() {
  return <StructureSection editableTexts={false} />
}

function dialogCategories(): AccordionCategory<DialogCategoryId>[] {
  const d = getT().app.songbook.detailPanel
  return [
    { id: "structure", title: d.catPortada, Body: CoverSection },
    { id: "style", title: d.estilCanconer, Body: StyleSection },
    { id: "body", title: d.cos, Body: BodySection },
    { id: "notation", title: d.formatAlteracions, Body: NotationSection },
    { id: "links", title: d.enllacosIQr, Body: LinksSection },
  ]
}

interface Props {
  title: string
  songs: PdfSong[]
  /** Opcions locals del visor: el diàleg les edita, però no les desa enlloc. */
  options: OptionsSourceValue
  downloading: boolean
  onDownload: () => void
  onClose: () => void
}

/**
 * Diàleg «Descarrega el PDF» de l'àrea pública: a l'esquerra, les opcions
 * de format del cançoner (sense títol, ordre ni tonalitats); a la dreta,
 * la vista prèvia paginada, exactament el que es descarregarà.
 */
export function PdfExportDialog({ title, songs, options, downloading, onDownload, onClose }: Props) {
  const t = getT()
  const td = t.public.pdfDialog
  const list = dialogCategories()
  const [openId, setOpenId] = useState<DialogCategoryId | null>("structure")
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [scrollRequest, setScrollRequest] = useState(0)
  const [scrollTarget, setScrollTarget] = useState<PreviewTarget>({ kind: "front" })
  // Mòbil: les opcions es pleguen per deixar lloc a la prèvia
  const [optionsOpen, setOptionsOpen] = useState(false)
  const downloadingRef = useRef(downloading)
  downloadingRef.current = downloading

  const { pdfOptions, style, accentColor } = options
  const input = useMemo(
    () => (songs.length === 0 ? null : { title, style, accentColor, options: pdfOptions, songs }),
    [title, style, accentColor, pdfOptions, songs],
  )

  function openCategory(id: DialogCategoryId | null) {
    if (id === "structure") {
      setScrollTarget({ kind: "front" })
      setScrollRequest((n) => n + 1)
    }
    setOpenId(id)
  }

  // Bloqueja l'scroll de la pàgina i tanca amb Escape (no mentre es genera)
  useEffect(() => {
    document.body.classList.add("pdf-dialog-open")
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !downloadingRef.current) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.classList.remove("pdf-dialog-open")
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <div
      className="pdf-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloading) onClose()
      }}
    >
      <div className="pdf-dialog" role="dialog" aria-modal="true" aria-label={td.titol}>
        <aside className={`pdf-dialog-options${optionsOpen ? " is-open" : ""}`}>
          <div className="options-panel-header">
            <h2 className="options-panel-title">{td.opcions}</h2>
            <button
              type="button"
              className="pdf-dialog-options-toggle"
              onClick={() => setOptionsOpen((v) => !v)}
              aria-expanded={optionsOpen}
            >
              {td.mostraOpcions}
              <IconChevronRight className="opt-cat-chevron" />
            </button>
          </div>
          <div className="options-panel-body">
            <OptionsSourceProvider value={options}>
              <OptionsAccordion categories={list} openId={openId} onOpen={openCategory} />
            </OptionsSourceProvider>
            <p className="pdf-dialog-hint">{td.opcionsHint}</p>
          </div>
        </aside>

        <section className="pdf-dialog-main">
          <header className="pdf-dialog-head">
            <div className="pdf-dialog-head-text">
              <h2 className="pdf-dialog-title">{title}</h2>
              {pageCount !== null && <span className="pdf-dialog-pages">{td.pagines(pageCount)}</span>}
            </div>
            <div className="pdf-dialog-actions">
              <button
                type="button"
                className="songbook-viewer-btn songbook-viewer-btn--primary"
                onClick={onDownload}
                disabled={downloading || songs.length === 0}
              >
                {downloading ? <IconClock /> : <IconFileText />}{" "}
                {downloading ? t.public.sharedView.generantPdf : td.descarrega}
              </button>
              <button
                type="button"
                className="pdf-dialog-close"
                onClick={onClose}
                disabled={downloading}
                aria-label={td.tancar}
                title={td.tancar}
              >
                <IconX />
              </button>
            </div>
          </header>
          <PaginatedPreview
            className="pdf-dialog-preview"
            input={input}
            scrollTarget={scrollTarget}
            scrollRequest={scrollRequest}
            onPageCount={setPageCount}
            zoomable
            globalZoomKeys
          />
        </section>
      </div>
    </div>
  )
}
