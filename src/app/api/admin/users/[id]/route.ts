import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { z } from "zod"
import { updateUser } from "@/db/queries/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const updateUserSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id: rawId } = await params
    const id = Number(rawId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 })
    }

    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dades invàlides" }, { status: 400 })
    }

    const result = await updateUser(id, user.id, parsed.data)

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/admin/users/[id]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
