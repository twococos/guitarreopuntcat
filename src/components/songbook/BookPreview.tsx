"use client"
import { useMemo } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { entriesToPdfSongs } from "@/lib/pdf-client/songs"
import { PaginatedPreview } from "@/components/shared/PaginatedPreview"
import { getT } from "@/lib/i18n"

/**
 * Vista prèvia del llibret a l'editor de cançoners: PaginatedPreview amb
 * les cançons i opcions del store. Seleccionar una cançó només hi fa
 * scroll (`previewScrollRequest` → `previewTarget`). Amb zoom: les
 * dreceres de teclat només amb el ratolí a sobre (la pàgina és l'app).
 */
export function BookPreview() {
  const t = getT()
  const canconer = useSongbookStore((s) => s.canconer)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  const previewScrollRequest = useSongbookStore((s) => s.previewScrollRequest)
  const previewTarget = useSongbookStore((s) => s.previewTarget)

  const input = useMemo(
    () =>
      canconer.length === 0
        ? null
        : {
            title: canconerTitle || "El meu cançoner",
            style: canconerStyle,
            accentColor,
            options: pdfOptions,
            songs: entriesToPdfSongs(canconer),
          },
    [canconer, canconerTitle, canconerStyle, accentColor, pdfOptions],
  )

  return (
    <PaginatedPreview
      id="tab-preview"
      className="tab-content active"
      input={input}
      scrollTarget={previewTarget}
      scrollRequest={previewScrollRequest}
      zoomable
      empty={
        <div id="detail-empty" className="empty-state">
          <span>←</span>
          <p>{t.app.songbook.detailPanel.previaBuida}</p>
        </div>
      }
    />
  )
}
