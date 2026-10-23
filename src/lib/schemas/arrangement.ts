import { z } from "zod"

/**
 * Arranjament ràpid (§22): recepta sobre el content original d'una cançó pública, desada a
 * l'entrada del cançoner (`canconer_songs.arrangement`). Vegeu src/lib/arrangement/.
 */

const line = z.string().max(2000)
const block = z.number().int().min(0).max(100_000)

export const eraseMarkSchema = z.discriminatedUnion("k", [
  z.object({ k: z.literal("line"), b: block, line }),
  z.object({
    k: z.literal("text"),
    b: block,
    line,
    start: z.number().int().min(0).max(2000),
    end: z.number().int().min(0).max(2000),
  }),
  z.object({ k: z.literal("chord"), b: block, line, ci: z.number().int().min(0).max(200) }),
])

export const arrangeItemSchema = z.object({
  sec: z.number().int().min(-1).max(100_000),
  name: z.string().max(200),
  erase: z.array(eraseMarkSchema).max(500).optional(),
})

export const quickArrangementSchema = z
  .object({
    v: z.literal(1),
    base: z.string().max(16),
    items: z.array(arrangeItemSchema).min(1).max(64),
  })
  .refine((qa) => qa.items.reduce((n, it) => n + (it.erase?.length ?? 0), 0) <= 500, {
    message: "Massa marques",
  })

export type EraseMark = z.infer<typeof eraseMarkSchema>
export type ArrangeItem = z.infer<typeof arrangeItemSchema>
export type QuickArrangement = z.infer<typeof quickArrangementSchema>

/** Recepta desada (JSON de la BD o d'una petició): vàlida o null. */
export function parseArrangement(raw: unknown): QuickArrangement | null {
  if (raw == null) return null
  let value = raw
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const r = quickArrangementSchema.safeParse(value)
  return r.success ? r.data : null
}
