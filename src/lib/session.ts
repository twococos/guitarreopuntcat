import "server-only"
import { NextResponse } from "next/server"
import { auth } from "./auth"

export type SessionUser = {
  id: number
  name: string
  email: string
  image?: string | null
  role: "user" | "admin"
  active: boolean
}

/**
 * Obté l'usuari de la sessió actual (o null).
 * Per usar dins Server Components, Route Handlers o Server Actions.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  const u = session?.user
  // `user.id==="0"` o `active===false` marca usuari desactivat/eliminat
  if (!u || !u.id || u.id === "0" || !u.active) return null
  return {
    id: Number(u.id),
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: u.role,
    active: u.active,
  }
}

/**
 * Requereix login. Si no hi ha sessió retorna una Response 401
 * que el route handler pot retornar directament.
 *
 * Ús:
 *   const result = await requireAuth()
 *   if (result instanceof NextResponse) return result
 *   const { user } = result
 */
export async function requireAuth(): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "No autenticat" }, { status: 401 })
  }
  return { user }
}

/**
 * Requereix login + rol d'administrador.
 */
export async function requireAdmin(): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "No autenticat" }, { status: 401 })
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Accés restringit a administradors" },
      { status: 403 },
    )
  }
  return { user }
}
