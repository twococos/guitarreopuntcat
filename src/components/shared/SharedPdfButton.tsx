"use client"
import type { CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"
import { getT } from "@/lib/i18n"
import { usePdfProgress } from "@/hooks/usePdfProgress"
import { requestPdf, downloadBlob } from "@/lib/pdf-client/request"
import { PdfProgressOverlay } from "@/components/shared/PdfProgressOverlay"
import { IconClock, IconFileText } from "@/components/shared/Icons"

interface Props {
  title: string
  style: CanconerStyle
  accentColor: string | null
  pdfOptions: PdfOptions | null
  songs: Array<{ id: number; semitones: number }>
}

export function SharedPdfButton({ title, style, accentColor, pdfOptions, songs }: Props) {
  const t = getT()
  const pdfProgress = usePdfProgress()

  async function handleClick() {
    if (pdfProgress.active) return
    pdfProgress.start(t.common.pdfProgress.missatges)
    try {
      // Sense opcions guardades, requestPdf aplica els defaults del schema.
      const blob = await requestPdf(
        { title, style, accentColor, options: pdfOptions, songs },
        pdfProgress.report,
      )
      // Accelerem la barra fins al 100% i tanquem l'overlay abans de
      // disparar la descàrrega.
      await pdfProgress.finish()
      downloadBlob(blob, `${title}.pdf`)
    } catch (err) {
      console.error("Error generant el PDF:", err)
      // Aquesta pàgina no munta <ToastHost />: per això alert().
      pdfProgress.fail()
      alert(t.public.sharedView.errorGenerantPdf)
    }
  }

  return (
    <>
      <button className="btn-pdf" onClick={handleClick} disabled={pdfProgress.active}>
        {pdfProgress.active ? (
          <>
            <IconClock /> {t.public.sharedView.generantPdf}
          </>
        ) : (
          <>
            <IconFileText /> {t.public.sharedView.descarregarPdf}
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
