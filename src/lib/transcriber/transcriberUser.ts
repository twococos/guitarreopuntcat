import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/db/client"

/**
 * Obté (o crea) l'usuari sistema "Transcriptor", autor de les propostes que
 * generen els workers de transcripció. Anàleg a `getOrCreateImporterUser`
 * (src/lib/bulkImport/importerUser.ts): així l'admin distingeix al panell les
 * propostes que surten de l'àudio.
 *
 * No usa Google: googleId sintètic "__transcriptor__".
 */
export function getOrCreateTranscriberUser(): number {
  const SYNTHETIC_GOOGLE_ID = "__transcriptor__"

  const existing = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.googleId, SYNTHETIC_GOOGLE_ID))
    .get()
  if (existing) return existing.id

  const result = db
    .insert(schema.users)
    .values({
      googleId: SYNTHETIC_GOOGLE_ID,
      email: "transcriptor@guitarreo.cat",
      name: "Transcriptor",
      avatarUrl: "/img/Logo.png",
      role: "user",
      active: 1,
    })
    .run()

  return Number(result.lastInsertRowid)
}
