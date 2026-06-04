import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/session"
import { getAccountSummary, updateAccountName, softDeleteAccount } from "@/db/queries/account"
import { updateAccountSchema } from "@/lib/schemas/account"
import { logEvent } from "@/lib/analytics/logEvent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ─── GET /api/account ────────────────────────────────────────

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const summary = await getAccountSummary(user.id)
    if (!summary) {
      return NextResponse.json({ error: "Usuari no trobat" }, { status: 404 })
    }

    return NextResponse.json(summary)
  } catch (err) {
    console.error("[GET /api/account]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

// ─── PATCH /api/account ──────────────────────────────────────

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const body = await request.json()
    const parsed = updateAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const result = await updateAccountName(user.id, parsed.data.name)

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    logEvent({
      type: "account_update",
      request,
      userId: user.id,
      metadata: {},
      status: 200,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/account]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

// ─── DELETE /api/account ─────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    await softDeleteAccount(user.id)

    logEvent({
      type: "account_delete",
      request,
      userId: user.id,
      metadata: {},
      status: 200,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/account]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
