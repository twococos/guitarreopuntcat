import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import { blockIp, unblockIp } from "@/db/queries/analytics/suspicious"
import { invalidateBlocklist } from "@/lib/analytics/blocklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const blockBodySchema = z.object({
  ip_hash: z.string().min(1),
  reason: z.string().optional(),
})

const unblockBodySchema = z.object({
  ip_hash: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const raw = await request.json()
    const parsed = blockBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body invalid", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { ip_hash, reason } = parsed.data

    const { id } = await blockIp({
      ip_hash,
      reason: reason ?? null,
      blocked_by: user.id,
    })
    invalidateBlocklist()

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.block_ip", target_id: id },
      status: 200,
    })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error("[POST /api/admin/analytics/block]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const raw = await request.json()
    const parsed = unblockBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body invalid", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { ip_hash } = parsed.data

    await unblockIp(ip_hash)
    invalidateBlocklist()

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.unblock_ip" },
      status: 200,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/admin/analytics/block]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
