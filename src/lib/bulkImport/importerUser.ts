import "server-only"
import { eq } from "drizzle-orm"
import { db, schema } from "@/db/client"

/**
 * Obté (o crea) l'usuari sistema "Importador" usat per a marcar com a
 * autor de les propostes creades pel mecanisme d'importació massiva
 * (vegeu `/app/admin/import`). Així l'admin pot identificar al panell de
 * propostes quines provenen del bulk import.
 *
 * No usa Google: googleId sintètic "__importer__".
 */
export function getOrCreateImporterUser(): number {
  const SYNTHETIC_GOOGLE_ID = "__importer__"
  const EMAIL = "importador@guitarreo.cat"
  const AVATAR = "/img/Logo.png"

  const existing = db
    .select({ id: schema.users.id, avatarUrl: schema.users.avatarUrl })
    .from(schema.users)
    .where(eq(schema.users.googleId, SYNTHETIC_GOOGLE_ID))
    .get()

  if (existing) {
    // Backfill: si l'usuari es va crear sense avatar (versió antiga), li
    // posem el logo ara perquè aparegui al panell d'admin.
    if (!existing.avatarUrl) {
      db.update(schema.users)
        .set({ avatarUrl: AVATAR })
        .where(eq(schema.users.id, existing.id))
        .run()
    }
    return existing.id
  }

  const result = db
    .insert(schema.users)
    .values({
      googleId: SYNTHETIC_GOOGLE_ID,
      email: EMAIL,
      name: "Importador",
      avatarUrl: AVATAR,
      role: "user",
      active: 1,
    })
    .run()

  return Number(result.lastInsertRowid)
}
