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

/** Pila de fonts del títol de cada estil — espill de song-styles.css.
 *  S'usa al selector d'estil perquè cada opció es mostri amb la seva
 *  pròpia tipografia (amb fallback, com al cançoner real). */
export const STYLE_TITLE_FONTS: Record<CanconerStyle, string> = {
  classic: '"Georgia", serif',
  minimal: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  bold: '"Impact", "Helvetica Neue", sans-serif',
  serif: '"Georgia", "Cambria", serif',
  handwritten: '"Bradley Hand", "Segoe Script", cursive',
  compact: '"Georgia", serif',
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

/* ── Opcions de generació de PDF ──────────────────────────── */

/* Mida de lletra del cos com a factor multiplicador continu.
 * Abans era un enum (small/normal/large); ara és un slider continu.
 * Conservem el rang centrat a 1.0 i ampliem una mica els extrems. */
export const FONT_SCALE_MIN = 0.7
export const FONT_SCALE_MAX = 1.3
export const FONT_SCALE_DEFAULT = 1.0
export const FONT_SCALE_STEP = 0.05

/** Equivalència dels valors antics (enum) → factor numèric, per a
 *  retrocompatibilitat amb cançoners guardats abans del slider. */
const LEGACY_FONT_SCALE: Record<string, number> = {
  small: 0.85,
  normal: 1.0,
  large: 1.15,
}

/** Accepta un número (nou) o un dels strings antics (small/normal/large)
 *  i el normalitza sempre a número dins del rang permès. */
const fontScaleSchema = z.preprocess(
  (v) => {
    if (typeof v === "string" && v in LEGACY_FONT_SCALE) return LEGACY_FONT_SCALE[v]
    return v
  },
  z.number().min(FONT_SCALE_MIN).max(FONT_SCALE_MAX).default(FONT_SCALE_DEFAULT),
)

/** Plataforma d'enllaç/QR. "none" desactiva la funció corresponent. */
export const LINK_PLATFORMS = ["none", "youtube", "spotify"] as const
export type LinkPlatform = (typeof LINK_PLATFORMS)[number]

export const pdfOptionsSchema = z.object({
  page_breaks: z.boolean().default(true),
  columns: z.number().int().min(1).max(3).default(1),
  show_index: z.boolean().default(true),
  show_cover: z.boolean().default(true),
  cover_subtitle: z.string().max(200).nullable().default(null),
  book_format: z.boolean().default(false),
  margin_top: z.number().min(0).max(50).default(20),
  margin_right: z.number().min(0).max(50).default(18),
  margin_bottom: z.number().min(0).max(50).default(20),
  margin_left: z.number().min(0).max(50).default(18),
  font_scale: fontScaleSchema,
  // Enllaç clicable al títol i codi QR són independents: cadascú apunta a
  // la plataforma que es triï ("none" = desactivat). Per defecte YouTube.
  link_platform: z.enum(LINK_PLATFORMS).default("youtube"),
  qr_platform: z.enum(LINK_PLATFORMS).default("youtube"),
  // Notació enharmònica del render: per cada nota negra, true = bemoll.
  // El nom intern de la tonalitat es guarda igual; això només afecta com
  // es mostren les notes (acords + badge de tonalitat) a la preview i al PDF.
  // .default() garanteix retrocompatibilitat amb cançoners ja guardats.
  notation: z
    .object({
      "C#": z.boolean(),
      "D#": z.boolean(),
      "F#": z.boolean(),
      "G#": z.boolean(),
      "A#": z.boolean(),
    })
    .default({ "C#": false, "D#": false, "F#": false, "G#": false, "A#": false }),
})

export type PdfOptions = z.infer<typeof pdfOptionsSchema>

export const PDF_OPTIONS_DEFAULTS: PdfOptions = pdfOptionsSchema.parse({})

/* ── Save ─────────────────────────────────────────────────── */

export const canconerSaveSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().min(1).default("El meu cançoner"),
  style: canconerStyleSchema,
  accent_color: accentColorSchema,
  pdf_options: pdfOptionsSchema.default(PDF_OPTIONS_DEFAULTS),
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
