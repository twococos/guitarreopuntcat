import { z } from "zod"

/**
 * Reports d'errors de les cançons públiques (vegeu .claude/PLAN_ERRORS.md).
 *
 * Tot es refereix al content ORIGINAL de la cançó (sense transposar, acords en
 * sostinguts). Les posicions són del model de l'editor (src/lib/editor/model.ts):
 * `block` és l'índex de la línia i `line` el seu text cru, que serveix per
 * reancorar l'ítem si el content ha canviat des del report. Els offsets són de
 * caràcter dins el text pla de la línia (sense els acords).
 */

const MAX_TEXT = 2000

// Acord: arrel + sufix + baix opcional. Prou permissiu per als sufixos de la BD.
const chord = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-G][#b]?[^\s<>/]{0,10}(\/[A-G][#b]?)?$/, "Acord no vàlid")

const anchor = {
  block: z.number().int().min(0).max(5000),
  line: z.string().max(MAX_TEXT),
}

const offset = z.number().int().min(0).max(MAX_TEXT)
const sectionName = z.string().trim().min(1).max(60)

export const REPORT_CATEGORIES = ["chords", "lyrics", "sections", "other"] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]

export const META_FIELDS = ["title", "artist", "album", "year", "capo", "youtube_url", "youtube_broken"] as const
export type MetaField = (typeof META_FIELDS)[number]

export const reportItemSchema = z.discriminatedUnion("kind", [
  // ── Acords ──
  z.object({
    kind: z.literal("chord_replace"),
    ...anchor,
    chord_idx: z.number().int().min(0).max(500),
    from: chord,
    to: chord,
    // "all": totes les aparicions de `from` a la cançó
    scope: z.enum(["one", "all"]).default("one"),
  }),
  z.object({ kind: z.literal("chord_add"), ...anchor, offset, chord }),
  z.object({
    kind: z.literal("chord_move"),
    ...anchor,
    chord_idx: z.number().int().min(0).max(500),
    chord,
    to_block: anchor.block,
    to_line: anchor.line,
    to_offset: offset,
  }),
  z.object({
    kind: z.literal("chord_remove"),
    ...anchor,
    chord_idx: z.number().int().min(0).max(500),
    chord,
  }),
  // Tots els acords estan desplaçats: cal transposar la cançó `semitones`.
  z.object({
    kind: z.literal("song_key"),
    semitones: z.number().int().min(1).max(11),
    from_key: z.string().max(8),
    to_key: z.string().max(8),
  }),

  // ── Lletra ──
  // Substitueix [start, end) del text pla. `to` buit = sobra; start === end = falta.
  z.object({
    kind: z.literal("lyric_replace"),
    ...anchor,
    start: offset,
    end: offset,
    from: z.string().max(MAX_TEXT),
    to: z.string().max(MAX_TEXT),
  }),
  // Falta una línia sencera després de `block`.
  z.object({
    kind: z.literal("lyric_add_line"),
    ...anchor,
    text: z.string().trim().min(1).max(MAX_TEXT),
  }),
  z.object({ kind: z.literal("lyric_version"), text: z.string().max(MAX_TEXT).default("") }),

  // ── Seccions ──
  z.object({ kind: z.literal("section_rename"), ...anchor, from: z.string().max(60), to: sectionName }),
  // Falta el títol d'una secció: comença just abans de `block`.
  z.object({ kind: z.literal("section_add"), ...anchor, name: sectionName }),
  z.object({ kind: z.literal("section_remove"), ...anchor, name: z.string().max(60) }),
  // Falta una secció sencera abans (o després) de `block`: igual que una altra o amb text.
  z.object({
    kind: z.literal("section_missing"),
    ...anchor,
    position: z.enum(["before", "after"]).default("before"),
    name: sectionName,
    copy_of: z
      .object({ block: anchor.block, line: anchor.line })
      .nullable()
      .default(null),
    text: z.string().max(MAX_TEXT).default(""),
  }),

  // ── Altres ──
  z.object({
    kind: z.literal("meta"),
    field: z.enum(META_FIELDS),
    from: z.string().max(500),
    to: z.string().max(500),
  }),
  z.object({ kind: z.literal("other"), text: z.string().trim().min(1).max(MAX_TEXT) }),
])

export type ReportItem = z.infer<typeof reportItemSchema>
export type ReportItemKind = ReportItem["kind"]

export const reportInputSchema = z.object({
  items: z.array(reportItemSchema).min(1).max(20),
  comment: z.string().trim().max(MAX_TEXT).default(""),
  content_hash: z.string().max(32),
  semitones: z.number().int().min(-11).max(11).default(0),
  context: z
    .discriminatedUnion("source", [
      z.object({ source: z.literal("song") }),
      z.object({ source: z.literal("songbook"), songbook_id: z.number().int().positive() }),
      z.object({ source: z.literal("share"), token: z.string().min(1).max(64) }),
    ])
    .default({ source: "song" }),
  // Antispam: el camp trampa ha d'arribar buit i el formulari ha d'haver estat obert un mínim.
  website: z.string().max(200).default(""),
  elapsed_ms: z.number().int().min(0),
})

export type ReportInput = z.infer<typeof reportInputSchema>

export const reportApplySchema = z.object({
  song_id: z.number().int().positive(),
  item_ids: z.array(z.number().int().positive()).min(1).max(200),
  preview: z.boolean().default(false),
})

// Rebutjar, o marcar com a aplicat el que l'admin ha corregit a mà a l'editor
export const reportReviewSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(["rejected", "applied"]).default("rejected"),
})

/** Categoria de cada tipus (per filtrar i agrupar a l'admin). */
export const KIND_CATEGORY: Record<ReportItemKind, ReportCategory> = {
  chord_replace: "chords",
  chord_add: "chords",
  chord_move: "chords",
  chord_remove: "chords",
  song_key: "chords",
  lyric_replace: "lyrics",
  lyric_add_line: "lyrics",
  lyric_version: "lyrics",
  section_rename: "sections",
  section_add: "sections",
  section_remove: "sections",
  section_missing: "sections",
  meta: "other",
  other: "other",
}
