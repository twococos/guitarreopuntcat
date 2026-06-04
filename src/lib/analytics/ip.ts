/**
 * Hash d'IP amb salt diari per a anonimitzar adreces IP.
 * El salt rota cada dia (UTC) i s'emmagatzema a la taula `salts` de la BD d'analítiques.
 */

import crypto from "node:crypto"
import { analyticsDb } from "@/db/analyticsClient"
import { salts } from "@/db/analyticsSchema"
import { eq } from "drizzle-orm"

// Cache en memòria del salt actual; s'invalida quan canvia el dia
let saltCache: { date: string; salt: string } | null = null

/** Retorna la data actual en format YYYY-MM-DD (UTC). */
function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Obté el salt del dia actual (UTC).
 * Si no existeix a la BD, en crea un de nou.
 * Utilitza INSERT OR IGNORE + SELECT per evitar problemes de concurrència.
 * El valor es cacheja en memòria fins que canvia el dia.
 */
export function getDailySalt(): string {
  const today = todayIsoUtc()

  // Si el cache és vàlid, retorna directament
  if (saltCache !== null && saltCache.date === today) {
    return saltCache.salt
  }

  // Genera un salt nou; si un altre procés ja ha inserit el del dia, INSERT OR IGNORE l'ignora
  const newSalt = crypto.randomBytes(32).toString("hex")

  // Drizzle no exposa INSERT OR IGNORE directament; usem la BD raw per a aquesta operació atòmica
  const rawDb = (analyticsDb as unknown as { _: { session: { client: import("better-sqlite3").Database } } })?._?.session?.client

  if (rawDb) {
    rawDb
      .prepare("INSERT OR IGNORE INTO salts (date, salt) VALUES (?, ?)")
      .run(today, newSalt)
  } else {
    // Fallback via Drizzle si no podem accedir al client raw
    try {
      analyticsDb.insert(salts).values({ date: today, salt: newSalt }).run()
    } catch {
      // Ignorem l'error d'unicitat si ja existeix
    }
  }

  // Llegim el salt real (pot ser el nostre o el d'un altre procés que s'ha avançat)
  const row = analyticsDb.select().from(salts).where(eq(salts.date, today)).get()

  const resolvedSalt = row?.salt ?? newSalt

  // Actualitzem el cache
  saltCache = { date: today, salt: resolvedSalt }

  return resolvedSalt
}

/**
 * Retorna un hash SHA-256 truncat a 32 caràcters (128 bits) de la IP donada,
 * combinada amb el salt diari per a anonimitzar i rotar cada dia.
 * Si la IP és buida o indefinida, s'hash la cadena "unknown".
 */
export function hashIp(ip: string | null | undefined): string {
  const salt = getDailySalt()
  const rawIp = ip && ip.trim().length > 0 ? ip.trim() : "unknown"
  return crypto
    .createHash("sha256")
    .update(`${rawIp}|${salt}`)
    .digest("hex")
    .slice(0, 32)
}
