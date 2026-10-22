import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, schema } from "@/db/client"
import { countRecentReports, createReport } from "@/db/queries/reports"
import { getSongAccessRow } from "@/lib/access/songs"
import { hashIp } from "@/lib/analytics/ip"
import { reportInputSchema } from "@/lib/schemas/report"
import { getSessionUser } from "@/lib/session"
import { SONG_STATE } from "@/lib/songKind"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Màxim de reports per sessió o IP en una hora. */
const MAX_PER_HOUR = 10
/** Temps mínim entre obrir el report i enviar-lo (els bots van més ràpid). */
const MIN_ELAPSED_MS = 3000

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "0.0.0.0"
}

function sessionId(request: Request): string {
  const m = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)__cnc_sid=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ""
}

/**
 * POST /api/songs/[id]/reports — un visitant (amb sessió o sense) reporta
 * errors d'una cançó pública. No toca la cançó: només desa el report.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params
    const songId = Number(rawId)
    if (!Number.isInteger(songId) || songId <= 0) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const access = getSongAccessRow(songId)
    if (!access || access.state !== SONG_STATE.PUBLIC) {
      return NextResponse.json({ error: "Cançó no trobada" }, { status: 404 })
    }

    const parsed = reportInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades no vàlides", details: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data

    // Camp trampa ple: és un bot. Responem com si res perquè no ho intenti d'una altra manera.
    if (input.website) return NextResponse.json({ ok: true })
    if (input.elapsed_ms < MIN_ELAPSED_MS) {
      return NextResponse.json({ error: "Massa ràpid. Torna-ho a provar." }, { status: 400 })
    }

    const sid = sessionId(request)
    const sessionHash = sid ? crypto.createHash("sha256").update(sid).digest("hex").slice(0, 32) : ""
    const ipHash = hashIp(clientIp(request))
    if (countRecentReports(sessionHash || "-", ipHash, 60) >= MAX_PER_HOUR) {
      return NextResponse.json(
        { error: "Has enviat molts reports seguits. Torna-ho a provar d'aquí a una estona." },
        { status: 429 },
      )
    }

    // El cançoner d'origen només es desa si existeix (el token es tradueix al seu id)
    const ctx = input.context
    const canconer =
      ctx.source === "song"
        ? undefined
        : db
            .select({ id: schema.canconers.id })
            .from(schema.canconers)
            .where(
              ctx.source === "share"
                ? eq(schema.canconers.shareToken, ctx.token)
                : eq(schema.canconers.id, ctx.songbook_id),
            )
            .get()

    const user = await getSessionUser()
    const reportId = createReport(songId, input, {
      userId: user?.id ?? null,
      sessionHash,
      ipHash,
      source: canconer ? ctx.source : "song",
      canconerId: canconer?.id ?? null,
    })

    return NextResponse.json({ ok: true, id: reportId }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/songs/[id]/reports]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
