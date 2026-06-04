import { and, eq, sql } from "drizzle-orm"
import { db, schema } from "@/db/client"

// ─── Tipus públic de resum de compte ────────────────────────
export type AccountSummary = {
  id: number
  name: string
  email: string
  avatar_url: string | null
  google_name: string | null
  created_at: string | null
  canconer_count: number
  proposal_count: number
  pending_proposal_count: number
}

// ─── GET /api/account/summary ───────────────────────────────

export async function getAccountSummary(userId: number): Promise<AccountSummary | null> {
  // Dades bàsiques de l'usuari
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()

  if (!user) return null

  // Queries de comptadors separades (evitem inflament per JOINs múltiples)
  const [canconerRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.canconers)
    .where(eq(schema.canconers.userId, userId))

  const [proposalRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songProposals)
    .where(eq(schema.songProposals.userId, userId))

  const [pendingRow] = await db
    .select({ count: sql<number>`COUNT(*)`.as("c") })
    .from(schema.songProposals)
    // Filtre combinat: usuari + estat pendent
    .where(and(eq(schema.songProposals.userId, userId), eq(schema.songProposals.status, "pending")))

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatarUrl ?? null,
    google_name: user.googleName ?? null,
    created_at: user.createdAt ?? null,
    canconer_count: canconerRow?.count ?? 0,
    proposal_count: proposalRow?.count ?? 0,
    pending_proposal_count: pendingRow?.count ?? 0,
  }
}

// ─── PATCH /api/account/name ─────────────────────────────────

export async function updateAccountName(
  userId: number,
  name: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const trimmed = name.trim()

  if (trimmed.length < 1 || trimmed.length > 80) {
    return { error: "El nom ha de tenir entre 1 i 80 caràcters", status: 400 as const }
  }

  db.update(schema.users).set({ name: trimmed }).where(eq(schema.users.id, userId)).run()

  return { ok: true as const }
}

// ─── DELETE /api/account ─────────────────────────────────────

export async function softDeleteAccount(userId: number): Promise<{ ok: true }> {
  // Valor únic per evitar col·lisions a l'índex UNIQUE de email i googleId
  const placeholder = `deleted-${userId}@deleted.local`

  db.transaction(() => {
    db.update(schema.users)
      .set({
        active: 0,
        name: "",
        email: placeholder,
        googleId: placeholder,
        avatarUrl: null,
        googleName: null,
      })
      .where(eq(schema.users.id, userId))
      .run()
  })

  return { ok: true as const }
}
