"use client"
import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import type { CanconerStyle, PdfOptions } from "@/lib/schemas/canconer"

/* ── Font de les opcions de format ───────────────────────────
 *  Els controls de sections.tsx no saben d'on surten les opcions: a /app,
 *  del store del cançoner (StoreOptionsSource); al diàleg de PDF de l'àrea
 *  pública, d'un estat local del visor (no es desa enlloc). */

export interface OptionsSourceValue {
  pdfOptions: PdfOptions
  setPdfOption: <K extends keyof PdfOptions>(key: K, value: PdfOptions[K]) => void
  style: CanconerStyle
  setStyle: (style: CanconerStyle) => void
  accentColor: string | null
  setAccentColor: (color: string | null) => void
}

const OptionsSourceContext = createContext<OptionsSourceValue | null>(null)

export function OptionsSourceProvider({ value, children }: { value: OptionsSourceValue; children: ReactNode }) {
  return <OptionsSourceContext.Provider value={value}>{children}</OptionsSourceContext.Provider>
}

/** Opcions del cançoner que s'edita a /app. */
export function StoreOptionsSource({ children }: { children: ReactNode }) {
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  const setPdfOption = useSongbookStore((s) => s.setPdfOption)
  const style = useSongbookStore((s) => s.canconerStyle)
  const setStyle = useSongbookStore((s) => s.setCanconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const setAccentColor = useSongbookStore((s) => s.setAccentColor)
  const value = useMemo(
    () => ({ pdfOptions, setPdfOption, style, setStyle, accentColor, setAccentColor }),
    [pdfOptions, setPdfOption, style, setStyle, accentColor, setAccentColor],
  )
  return <OptionsSourceProvider value={value}>{children}</OptionsSourceProvider>
}

export function useOptionsSource(): OptionsSourceValue {
  const ctx = useContext(OptionsSourceContext)
  if (!ctx) throw new Error("useOptionsSource fora d'un OptionsSourceProvider")
  return ctx
}
