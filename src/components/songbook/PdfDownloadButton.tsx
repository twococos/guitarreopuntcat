"use client"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { usePdfProgress } from "@/hooks/usePdfProgress"
import { requestPdf, downloadBlob } from "@/lib/pdf-client/request"
import { PdfProgressOverlay } from "@/components/shared/PdfProgressOverlay"
import { getT } from "@/lib/i18n"
import { IconClock, IconDownload, IconFileText } from "@/components/shared/Icons"

/**
 * Botó «PDF» del cançoner en curs, amb la seva barra de progrés.
 * Amb la vista prèvia oberta viu a la capçalera de la prèvia
 * (`variant="preview"`); plegada, torna a la capçalera del cançoner.
 */
export function PdfDownloadButton({ variant }: { variant: "panel" | "preview" }) {
  const t = getT()
  const canconer = useSongbookStore((s) => s.canconer)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  const showToast = useToastStore((s) => s.show)
  const pdfProgress = usePdfProgress()

  const hasItems = canconer.length > 0

  async function onGeneratePdf() {
    if (!hasItems || pdfProgress.active) return
    pdfProgress.start(t.common.pdfProgress.missatges)
    try {
      const blob = await requestPdf(
        {
          title: canconerTitle || "El meu cançoner",
          style: canconerStyle,
          accentColor,
          options: pdfOptions,
          songs: canconer.map((e) => ({ id: e.song.id, semitones: e.semitones })),
        },
        pdfProgress.report,
      )
      // Accelerem la barra fins al 100% i tanquem l'overlay abans de
      // disparar la descàrrega.
      await pdfProgress.finish()
      downloadBlob(blob, `${canconerTitle || "canconer"}.pdf`)
    } catch (err) {
      console.error("Error generant el PDF:", err)
      pdfProgress.fail()
      showToast(t.app.songbook.canconerPanel.errorGenerantPdf, { type: "error" })
    }
  }

  const Icon = variant === "preview" ? IconDownload : IconFileText

  return (
    <>
      <button
        id="btn-generate"
        className="btn-icon-action"
        disabled={!hasItems || pdfProgress.active}
        title={t.app.songbook.canconerPanel.generarPdfTitle}
        aria-label={t.app.songbook.canconerPanel.generarPdfTitle}
        onClick={onGeneratePdf}
      >
        {pdfProgress.active ? (
          <IconClock />
        ) : (
          <>
            <Icon /> {t.app.songbook.canconerPanel.pdfLabel}
          </>
        )}
      </button>
      <PdfProgressOverlay
        open={pdfProgress.active}
        pct={pdfProgress.pct}
        title={t.common.pdfProgress.titol}
        message={pdfProgress.message}
      />
    </>
  )
}
