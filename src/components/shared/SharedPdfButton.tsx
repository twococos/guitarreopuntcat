"use client"
import type { CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"
import { getT } from "@/lib/i18n"
import { usePdfProgress } from "@/hooks/usePdfProgress"
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
    pdfProgress.start(songs.length, t.common.pdfProgress.missatges)
    try {
      const body: Record<string, unknown> = {
        title,
        style,
        accent_color: accentColor,
        songs,
      }
      // Si el cançoner té opcions guardades, les enviem; si no,
      // l'endpoint aplica els defaults del schema.
      if (pdfOptions) body.pdf_options = pdfOptions

      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("error")
      const blob = await res.blob()
      // Accelerem la barra fins al 100% i tanquem l'overlay abans de
      // disparar la descàrrega.
      await pdfProgress.finish()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
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
