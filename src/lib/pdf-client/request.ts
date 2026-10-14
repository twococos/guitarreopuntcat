import { pdfOptionsSchema, type PdfOptions } from "@/lib/schemas/canconer"
import type { PdfClientInput, ProgressFn } from "./types"

/**
 * Punt d'entrada lleuger per als botons de PDF. No importa res pesant:
 * el generador (pdf-lib + fontkit) es carrega sota demanda.
 *
 * `?pdf=debug` a la URL deixa l'iframe paginat visible (doble clic el
 * tanca) i escriu el temps de cada fase a la consola.
 */

function isPdfDebug(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("pdf") === "debug"
}

export async function requestPdf(
  input: Omit<PdfClientInput, "options"> & { options: PdfOptions | null },
  onProgress?: ProgressFn,
): Promise<Blob> {
  // Normalitza opcions antigues o absents amb els defaults del schema.
  const options = pdfOptionsSchema.parse(input.options ?? {})
  const { generatePdfClient } = await import("./index")
  return generatePdfClient({ ...input, options }, { onProgress, debug: isPdfDebug() })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Alguns navegadors encara llegeixen l'URL just després del clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
