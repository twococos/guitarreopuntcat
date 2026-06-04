import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { canconerSaveSchema } from "@/lib/schemas/canconer"
import { listCanconersByUser, saveOrUpdateCanconer } from "@/db/queries/canconers"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const canconers = await listCanconersByUser(user.id)
    return NextResponse.json(canconers)
  } catch (err) {
    console.error("[GET /api/canconers]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const body = await request.json()
    const parsed = canconerSaveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const result = await saveOrUpdateCanconer(user.id, parsed.data)
    logEvent({
      type: "canconer_create",
      request,
      userId: user.id,
      metadata: { canconer_id: result.id },
      status: result.created ? 201 : 200,
    })
    return NextResponse.json({ id: result.id }, { status: result.created ? 201 : 200 })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Alguna cançó no existeix o no és pública") {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      const statusErr = err as Error & { status?: number }
      if (statusErr.status === 403) {
        return NextResponse.json({ error: "No autoritzat" }, { status: 403 })
      }
    }
    console.error("[POST /api/canconers]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
