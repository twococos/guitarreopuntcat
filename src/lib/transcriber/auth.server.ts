import "server-only"
import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db, schema } from "@/db/client"
import type { TranscriptionWorker } from "@/db/schema"

/**
 * Autenticació dels workers de transcripció (a part de NextAuth).
 *
 * Cada worker té un token propi, generat i revocable des de l'admin. Només se'n
 * desa el SHA-256: amb 32 bytes aleatoris no cal un hash lent tipus bcrypt.
 */

export function generateWorkerToken(): string {
  return `tx_${crypto.randomBytes(32).toString("base64url")}`
}

export function hashWorkerToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Retorna el worker del token `Authorization: Bearer …`, o una resposta 401. */
export function authenticateWorker(req: Request): TranscriptionWorker | NextResponse {
  const header = req.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) {
    return NextResponse.json({ error: "Falta el token" }, { status: 401 })
  }
  const worker = db
    .select()
    .from(schema.transcriptionWorkers)
    .where(eq(schema.transcriptionWorkers.tokenHash, hashWorkerToken(token)))
    .get()
  if (!worker || !worker.active) {
    return NextResponse.json({ error: "Token desconegut o revocat" }, { status: 401 })
  }
  return worker
}

/** Compara versions "x.y.z" numèricament. Negatiu si a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Versió mínima del worker (variable d'entorn TRANSCRIBER_MIN_VERSION). Si el
 * worker és més antic, 426: l'app d'escriptori s'autoactualitza.
 */
export function checkMinVersion(appVersion: string): NextResponse | null {
  return checkVersion(appVersion)
}

/** Versió del worker a partir del `User-Agent` (`transcriptor-worker/x.y.z`), per a les peticions GET. */
export function checkMinVersionFromUserAgent(req: Request): NextResponse | null {
  const m = /transcriptor-worker\/([\w.+-]+)/.exec(req.headers.get("user-agent") ?? "")
  return checkVersion(m?.[1] ?? "0")
}

function checkVersion(appVersion: string): NextResponse | null {
  const min = process.env.TRANSCRIBER_MIN_VERSION?.trim()
  if (!min || compareVersions(appVersion, min) >= 0) return null
  return NextResponse.json({ error: "Versió massa antiga", min_version: min }, { status: 426 })
}
