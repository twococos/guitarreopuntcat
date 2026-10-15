import "server-only"
import { NextResponse } from "next/server"

/** Mida màxima del cos d'una petició de worker (el resultat sol fer 10-20 KB). */
const MAX_BODY_BYTES = 2 * 1024 * 1024

/** Llegeix el cos JSON amb límit de mida. Retorna `undefined` si no és vàlid. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text().catch(() => "")
  if (text.length > MAX_BODY_BYTES) return undefined
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function jobLostResponse(): NextResponse {
  return NextResponse.json({ error: "La feina ja no és d'aquest worker" }, { status: 409 })
}
