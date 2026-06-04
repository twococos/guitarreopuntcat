import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/session"
import { logEvent } from "@/lib/analytics/logEvent"
import {
  getTopPagesByCategory,
  getCategoryAggregate,
} from "@/db/queries/analytics/pages"
import { parseDateRange, parseLimit } from "../_utils"
import type { PathCategory } from "@/lib/analytics/pathCategory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_CATEGORIES: ReadonlySet<PathCategory> = new Set<PathCategory>([
  "page",
  "public",
  "app",
  "song",
  "artist",
  "api",
])

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin()
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { searchParams } = new URL(request.url)

    const dateRange = parseDateRange(searchParams)
    if (dateRange instanceof NextResponse) return dateRange
    const { from, to } = dateRange

    const limit = parseLimit(searchParams, 50, 200)
    if (limit instanceof NextResponse) return limit

    const rawCategory = searchParams.get("category") ?? "page"
    if (!VALID_CATEGORIES.has(rawCategory as PathCategory)) {
      return NextResponse.json(
        { error: "Categoria invàlida" },
        { status: 400 },
      )
    }
    const category = rawCategory as PathCategory

    const [pages, aggregate] = await Promise.all([
      getTopPagesByCategory(category, from, to, limit),
      getCategoryAggregate(category, from, to),
    ])

    logEvent({
      type: "admin_action",
      request,
      userId: user.id,
      metadata: { action: "analytics.pages" },
      status: 200,
    })
    return NextResponse.json({ pages, aggregate })
  } catch (err) {
    console.error("[GET /api/admin/analytics/pages]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
