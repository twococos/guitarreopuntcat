import { z } from "zod"

/* ── Estils visuals del cançoner ──────────────────────────── */

export const CANCONER_STYLES = [
  "classic",
  "minimal",
  "bold",
  "serif",
  "handwritten",
  "compact",
] as const

export type CanconerStyle = (typeof CANCONER_STYLES)[number]

export const STYLE_LABELS: Record<CanconerStyle, string> = {
  classic: "Clàssic",
  minimal: "Minimalista",
  bold: "Atrevit",
  serif: "Serif elegant",
  handwritten: "Manuscrit",
  compact: "Compacte",
}

/** Color d'accent per defecte de cada preset (quan accentColor === null). */
export const STYLE_DEFAULT_ACCENTS: Record<CanconerStyle, string> = {
  classic: "#c0392b",
  minimal: "#111111",
  bold: "#2563eb",
  serif: "#5d3a1f",
  handwritten: "#1e3a5f",
  compact: "#c0392b",
}

/** Paleta predefinida del color picker (10 mostres). */
export const ACCENT_COLOR_PALETTE = [
  "#c0392b",
  "#ea580c",
  "#db2777",
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#16a34a",
  "#5d3a1f",
  "#1e3a5f",
  "#111111",
] as const

export const canconerStyleSchema = z.enum(CANCONER_STYLES).default("classic")

/** Color hex (#rgb o #rrggbb), o null per usar el default del preset. */
export const accentColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color hex invàlid")
  .nullable()
  .default(null)

/* ── Save ─────────────────────────────────────────────────── */

export const canconerSaveSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().min(1).default("El meu cançoner"),
  style: canconerStyleSchema,
  accent_color: accentColorSchema,
  songs: z.array(
    z.object({
      id: z.number().int(),
      semitones: z.number().int().default(0),
    }),
  ),
})

export type CanconerSave = z.infer<typeof canconerSaveSchema>

export const shareActionSchema = z.object({
  action: z.enum(["enable", "disable"]).default("enable"),
})

export type ShareAction = z.infer<typeof shareActionSchema>
