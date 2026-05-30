/**
 * Importació massiva (admin): rep una llista de files CSV i les processa
 * seqüencialment. Per a cada cançó:
 *   1. Crida l'importador adequat (host detectat a partir de la URL).
 *   2. Combina les metadades del CSV amb les del parser (CSV té prioritat).
 *   3. Comprova duplicats per artista+títol.
 *   4. Crea una proposta des de l'usuari "Importador" (state=2 pendent).
 *
 * Respon amb un stream SSE on cada esdeveniment és:
 *   { type: "progress", index, status: "running"|"ok"|"error"|"duplicate", error?, songId? }
 *   { type: "done" }
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { findImporter } from "@/lib/importers/registry.server"
import { normalizeSectionTitles } from "@/lib/importers/normalizeSections"
import { cleanupContent } from "@/lib/importers/cleanupContent"
import { getOrCreateImporterUser } from "@/lib/bulkImport/importerUser"
import {
  createBulkProposal,
  findExistingSongByArtistTitle,
  type BulkProposalInput,
} from "@/db/queries/proposals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const rowSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().optional().nullable(),
  year: z.string().optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  spotifyUrl: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
})

const OPTIONAL_FIELDS = [
  "album",
  "year",
  "youtubeUrl",
  "spotifyUrl",
  "language",
  "tags",
] as const
type OptionalField = (typeof OPTIONAL_FIELDS)[number]

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  // Camps (entre els no-obligatoris per defecte) que l'usuari ha marcat com
  // a obligatoris. Si un d'aquests està buit/invàlid en una fila, es saltarà
  // amb error. Els tres camps base (url, title, artist) són sempre obligatoris.
  required: z.array(z.enum(OPTIONAL_FIELDS)).default([]),
  // Índexs (0-based) que han de saltar-se la validació de camps requerits
  // (override "importar igualment" des de la UI).
  skipRequiredIndexes: z.array(z.number().int().nonnegative()).default([]),
})

const FIELD_LABELS: Record<OptionalField, string> = {
  album: "àlbum",
  year: "any",
  youtubeUrl: "link de YouTube",
  spotifyUrl: "link de Spotify",
  language: "idioma",
  tags: "etiquetes",
}

const YOUTUBE_RE = /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be)\//
const SPOTIFY_RE = /^https?:\/\/open\.spotify\.com\//

function validateRequired(
  row: z.infer<typeof rowSchema>,
  required: readonly OptionalField[],
): string | null {
  for (const f of required) {
    const raw = (row[f] ?? "").trim()
    if (!raw) {
      return `Camp obligatori buit: ${FIELD_LABELS[f]}`
    }
    if (f === "youtubeUrl" && !YOUTUBE_RE.test(raw)) {
      return "Link de YouTube no vàlid"
    }
    if (f === "spotifyUrl" && !SPOTIFY_RE.test(raw)) {
      return "Link de Spotify no vàlid"
    }
    if (f === "year") {
      const n = Number(raw)
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1000 || n > 2100) {
        return "Any no vàlid (format esperat: 1000-2100)"
      }
    }
  }
  return null
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Cos no vàlid." }, { status: 400 })
  }

  const { rows, required, skipRequiredIndexes } = parsed.data
  const skipSet = new Set(skipRequiredIndexes)
  const importerUserId = getOrCreateImporterUser()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        send({ type: "progress", index: i, status: "running" })

        try {
          // 1. Detecta importador
          const imp = findImporter(row.url)
          if (!imp) {
            send({
              type: "progress",
              index: i,
              status: "error",
              error: "Web no suportada",
            })
            continue
          }

          // 2. Valida camps marcats com a obligatoris per l'usuari (excepte
          //    si l'usuari ha demanat "importar igualment" per a aquesta fila).
          if (!skipSet.has(i)) {
            const reqErr = validateRequired(row, required)
            if (reqErr) {
              send({
                type: "progress",
                index: i,
                status: "error",
                error: reqErr,
              })
              continue
            }
          }

          // 3. Comprova duplicat (artista+títol del CSV)
          const dup = findExistingSongByArtistTitle(row.artist, row.title)
          if (dup) {
            send({
              type: "progress",
              index: i,
              status: "duplicate",
              error: `Ja existeix (id ${dup.id})`,
            })
            continue
          }

          // 4. Descarrega i parseja
          const html = await imp.fetch(row.url)
          const parsedSong = imp.parse(html, row.url)

          // 5. Normalitza contingut com fa /api/songs/import
          const normalized = normalizeSectionTitles(parsedSong.content)
          const content = cleanupContent(normalized)

          // 6. Construeix metadades: CSV té prioritat; si està buit, fallback al parser
          const yearNum = parseYear(row.year)
          const tagsValue = (row.tags ?? "").trim() || parsedSong.tags || ""
          const languageValue =
            (row.language ?? "").trim() || parsedSong.language || "ca"

          const input: BulkProposalInput = {
            title: row.title.trim(),
            artist: row.artist.trim(),
            key: parsedSong.key,
            capo: parsedSong.capo,
            content,
            language: languageValue,
            tags: tagsValue,
            album: nullIfEmpty(row.album) ?? parsedSong.album ?? null,
            year: yearNum ?? parsedSong.year ?? null,
            youtubeUrl: nullIfEmpty(row.youtubeUrl) ?? parsedSong.youtubeUrl ?? null,
            spotifyUrl: nullIfEmpty(row.spotifyUrl) ?? parsedSong.spotifyUrl ?? null,
          }

          const { songId } = createBulkProposal(importerUserId, input)
          send({ type: "progress", index: i, status: "ok", songId })
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconegut"
          console.error(`[import-bulk] fila ${i} (${row.url}):`, err)
          send({ type: "progress", index: i, status: "error", error: msg })
        }
      }

      send({ type: "done" })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

function nullIfEmpty(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function parseYear(v: string | null | undefined): number | null {
  if (!v) return null
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 1000 || i > 2100) return null
  return i
}
