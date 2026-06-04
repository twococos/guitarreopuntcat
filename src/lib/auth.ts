import "server-only"
import NextAuth, { type NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db/client"
import { users } from "@/db/schema"
import { logEvent } from "@/lib/analytics/logEvent"

/**
 * Estratègia JWT (sense BD per a sessions) per simplicitat.
 * El callback signIn crea/actualitza l'usuari a la taula `users`
 * existent, paritat amb el comportament de backend/routes/auth.js.
 *
 * La revocació es comprova a `session` cada cop: si `users.active = 0`
 * o l'usuari no existeix, la sessió retorna null.
 */
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30 dies
  pages: {
    signIn: "/",
    error: "/?auth=error",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google" || !account.providerAccountId) {
        logEvent({
          type: "signin_failure",
          metadata: { reason: "invalid_provider" },
        })
        return false
      }
      const googleId = account.providerAccountId
      const email = user.email ?? profile?.email ?? ""
      const name = user.name ?? profile?.name ?? email
      const picture = user.image ?? (profile as { picture?: string } | undefined)?.picture ?? null

      const existing = db
        .select()
        .from(users)
        .where(eq(users.googleId, googleId))
        .get()

      if (existing) {
        if (existing.active === 0) {
          logEvent({
            type: "signin_failure",
            metadata: { reason: "inactive_user" },
          })
          return false
        }
        // Preservem el `name` editat per l'usuari: només el sobreescrivim si
        // mai s'havia inicialitzat `googleName` (usuaris pre-migració). En
        // aquest cas inicialitzem ambdós camps amb el nom de Google actual.
        // En tots els casos refresquem email i avatar (font de veritat: Google).
        if (existing.googleName == null) {
          db.update(users)
            .set({ name, email, avatarUrl: picture, googleName: name })
            .where(eq(users.id, existing.id))
            .run()
        } else {
          db.update(users)
            .set({ email, avatarUrl: picture })
            .where(eq(users.id, existing.id))
            .run()
        }
      } else {
        const [{ count }] = db
          .select({ count: sql<number>`count(*)`.as("count") })
          .from(users)
          .all()
        const role: "user" | "admin" = count === 0 ? "admin" : "user"
        db.insert(users)
          .values({
            googleId,
            email,
            name,
            googleName: name,
            avatarUrl: picture,
            role,
          })
          .run()
      }
      return true
    },

    async jwt({ token, account }) {
      // Just després del signIn (account està definit), refresca el token
      // amb les dades fresques de la BD (id, role, active).
      if (account?.providerAccountId) {
        const u = db
          .select()
          .from(users)
          .where(eq(users.googleId, account.providerAccountId))
          .get()
        if (u) {
          token.sub = String(u.id)
          token.role = (u.role ?? "user") as "user" | "admin"
          token.name = u.name
          token.email = u.email
          token.picture = u.avatarUrl ?? undefined
        }
      }
      return token
    },

    async session({ session, token }) {
      // Cada session() refresca id/role/active de l'usuari des de la BD.
      // Si l'usuari ha estat desactivat o eliminat, retornem session sense
      // identificadors reals → requireAuth() retornarà 401.
      const id = token.sub ? Number(token.sub) : NaN
      const u = Number.isFinite(id)
        ? db.select().from(users).where(eq(users.id, id)).get()
        : undefined

      if (!u || u.active === 0) {
        // No podem retornar `user: undefined` (NextAuth ho considera obligatori).
        // Marquem amb id="0" i active=false; getSessionUser filtra per active.
        session.user = {
          id: "0",
          name: "",
          email: "",
          emailVerified: null,
          image: null,
          role: "user",
          active: false,
        }
        return session
      }

      session.user = {
        id: String(u.id),
        name: u.name,
        email: u.email,
        emailVerified: null,
        image: u.avatarUrl ?? null,
        role: (u.role ?? "user") as "user" | "admin",
        active: true,
      }
      return session
    },
  },
  events: {
    async signIn({ user, account }) {
      const userId = user?.id ? Number(user.id) : undefined
      logEvent({
        type: "signin_success",
        userId: Number.isFinite(userId) ? userId : null,
        metadata: { provider: account?.provider },
      })
    },
    async signOut(message) {
      const sub = "token" in message ? message.token?.sub : undefined
      const userId = sub ? Number(sub) : undefined
      logEvent({
        type: "signout",
        userId: Number.isFinite(userId) ? userId : null,
        metadata: {},
      })
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
