import { z } from "zod"
import { NextResponse } from "next/server"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Parseja i valida els parametres `from` i `to` de la query string.
 * Si no s'especifiquen retorna els ultims 30 dies.
 * Retorna un NextResponse 400 si el format no es valid.
 */
export function parseDateRange(
  searchParams: URLSearchParams,
): { from: string; to: string } | NextResponse {
  const today = new Date()
  const toDefault = today.toISOString().slice(0, 10)
  const fromDefault = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const rawFrom = searchParams.get("from") ?? fromDefault
  const rawTo = searchParams.get("to") ?? toDefault

  const parsedFrom = dateSchema.safeParse(rawFrom)
  const parsedTo = dateSchema.safeParse(rawTo)

  if (!parsedFrom.success || !parsedTo.success) {
    return NextResponse.json(
      { error: "Parametres 'from' i 'to' han de tenir format YYYY-MM-DD" },
      { status: 400 },
    )
  }

  return { from: parsedFrom.data, to: parsedTo.data }
}

/**
 * Parseja i valida el parametre `limit` de la query string.
 * Retorna un NextResponse 400 si el valor no es un enter positiu o supera el maxim.
 */
export function parseLimit(
  searchParams: URLSearchParams,
  defaultValue: number,
  maxValue: number,
): number | NextResponse {
  const raw = searchParams.get("limit")
  if (raw === null) return defaultValue

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return NextResponse.json(
      { error: "El parametre 'limit' ha de ser un enter positiu" },
      { status: 400 },
    )
  }
  if (parsed > maxValue) {
    return NextResponse.json(
      { error: `El parametre 'limit' no pot superar ${maxValue}` },
      { status: 400 },
    )
  }

  return parsed
}
