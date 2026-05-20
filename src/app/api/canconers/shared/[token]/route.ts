import { NextResponse } from "next/server"
import { getCanconerByToken } from "@/db/queries/canconers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: "Enllaç no vàlid" }, { status: 404 })
    }

    const canconer = await getCanconerByToken(token)
    if (!canconer) {
      return NextResponse.json({ error: "Enllaç no vàlid" }, { status: 404 })
    }

    return NextResponse.json(canconer)
  } catch (err) {
    console.error("[GET /api/canconers/shared/[token]]", err)
    return NextResponse.json({ error: "Error intern del servidor" }, { status: 500 })
  }
}
