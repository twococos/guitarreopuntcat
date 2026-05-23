"use client"
import { useState } from "react"
import type { CanconerStyle } from "@/types/song"
import type { PdfOptions } from "@/lib/schemas/canconer"

interface Props {
  title: string
  style: CanconerStyle
  accentColor: string | null
  pdfOptions: PdfOptions | null
  songs: Array<{ id: number; semitones: number }>
}

export function SharedPdfButton({ title, style, accentColor, pdfOptions, songs }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
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
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Error generant el PDF.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="btn-pdf" onClick={handleClick} disabled={loading}>
      {loading ? "⏳ Generant…" : "📄 Descarregar PDF"}
    </button>
  )
}
