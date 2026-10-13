import { pdfOptionsSchema, type PdfOptions } from "@/lib/schemas/canconer"
import type { PdfClientInput, ProgressFn } from "./types"

/**
 * Punt d'entrada lleuger per als botons de PDF: tria el motor i retorna
 * el Blob. No importa res pesant; el generador client es carrega sota
 * demanda.
 *
 * Motor (transitori, mentre conviuen els dos):
 *   · `?pdf=client` | `?pdf=server` a la URL → força el motor (sense retorn).
 *   · `?pdf=debug` → motor client amb l'iframe visible.
 *   · Si no, `NEXT_PUBLIC_PDF_ENGINE` ("client" | "server", per defecte
 *     "client"). Si el client falla, es torna a provar al servidor.
 */

export type PdfEngine = "client" | "server"

function queryFlag(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("pdf")
}

export function getPdfEngine(): PdfEngine {
  const q = queryFlag()
  if (q === "client" || q === "debug") return "client"
  if (q === "server") return "server"
  return process.env.NEXT_PUBLIC_PDF_ENGINE === "server" ? "server" : "client"
}

export function isPdfDebug(): boolean {
  return queryFlag() === "debug"
}

async function requestServerPdf(input: PdfClientInput): Promise<Blob> {
  const res = await fetch("/api/pdf/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      style: input.style,
      accent_color: input.accentColor,
      pdf_options: input.options,
      songs: input.songs,
    }),
  })
  if (!res.ok) throw new Error(`/api/pdf/generate ${res.status}`)
  return res.blob()
}

/** Genera el PDF amb el motor actiu. `onProgress` només rep valors amb el
 *  motor client (el de servidor no té fases reportables). */
export async function requestPdf(
  input: Omit<PdfClientInput, "options"> & { options: PdfOptions | null },
  onProgress?: ProgressFn,
): Promise<Blob> {
  // Normalitza opcions antigues o absents amb els defaults del schema.
  const full: PdfClientInput = { ...input, options: pdfOptionsSchema.parse(input.options ?? {}) }

  if (getPdfEngine() === "server") return requestServerPdf(full)

  try {
    const { generatePdfClient } = await import("./index")
    return await generatePdfClient(full, { onProgress, debug: isPdfDebug() })
  } catch (err) {
    // Forçat per URL: volem veure l'error, no amagar-lo amb el servidor.
    if (queryFlag() !== null) throw err
    console.error("El generador de PDF del navegador ha fallat; es prova al servidor.", err)
    return requestServerPdf(full)
  }
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
