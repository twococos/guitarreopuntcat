import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db, schema } from "@/db/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [songsCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.songs)

    const [usersCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.users)

    const [canconersCount] = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(schema.canconers)

    return NextResponse.json({
      status: "ok",
      db: {
        path: process.env.DB_PATH || "./data/canconer.db",
        songs: songsCount.count,
        users: usersCount.count,
        canconers: canconersCount.count,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: "error", error: message }, { status: 500 })
  }
}
