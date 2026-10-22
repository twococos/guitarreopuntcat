/**
 * src/lib/reports/__tests__/apply.test.ts
 * Tests de l'aplicació de correccions reportades.
 * Execució: npx tsx src/lib/reports/__tests__/apply.test.ts
 */

import { applyReportItems, fromLineModel, insertChordInText, toLineModel } from "../apply"
import { contentHash, dedupeKey } from "../dedupe"
import { lineDiff } from "../diff"
import { parse } from "../../editor/model"
import { reportItemSchema, type ReportItem } from "../../schemas/report"

// ── Utilitats de test ─────────────────────────────────────────────────────────

let failed = false

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failed = true
    console.error(`  FALLA: ${label}`)
    console.error(`    esperat: ${e}`)
    console.error(`    rebut:   ${a}`)
  }
}

function test(name: string, fn: () => void): void {
  console.log(`\n  ${name}`)
  fn()
}

/** Valida amb Zod com faria l'API (defaults inclosos). */
function item(raw: Record<string, unknown>): ReportItem {
  return reportItemSchema.parse(raw)
}

function apply(content: string, ...items: ReportItem[]) {
  return applyReportItems(content, items.map((it, i) => ({ id: i + 1, item: it })))
}

// ── Contingut de prova ────────────────────────────────────────────────────────

const SONG = [
  "<sec>Estrofa 1</sec>", // 0
  "<ch>Am</ch>En un lloc de la <ch>F</ch>Manxa", // 1
  "de quin <ch>C</ch>nom no vull <ch>G</ch>recordar", // 2
  "", // 3
  "<sec>Tornada</sec>", // 4
  "<ch>F</ch>La la <ch>G</ch>la", // 5
  "<ch>C</ch>Lo lo lo", // 6
  "", // 7
  "<sec>Estrofa 2</sec>", // 8
  "<ch>Am</ch>Una altra <ch>F</ch>línia", // 9
].join("\n")

const L = SONG.split("\n")

function withLine(i: number, line: string): string {
  const out = [...L]
  out[i] = line
  return out.join("\n")
}

console.log("Tests reports/apply.ts\n")

test("Model per línia: round-trip", () => {
  for (const raw of [L[1], L[2], "<ch>A</ch><ch>B</ch>", "text sol", "<ch>C</ch> <ch>G</ch>  x"]) {
    const b = parse(raw).blocks[0]
    if (b.kind !== "lyric") continue
    const back = fromLineModel(toLineModel(b.spans))
    assertEqual(back, b.spans, `round-trip ${raw}`)
  }
})

test("Sense ítems, el content no canvia", () => {
  assertEqual(apply(SONG).content, SONG, "idèntic")
})

test("chord_replace (un)", () => {
  const r = apply(SONG, item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "Dm" }))
  assertEqual(r.applied, [1], "aplicat")
  assertEqual(r.content, withLine(1, "<ch>Am</ch>En un lloc de la <ch>Dm</ch>Manxa"), "content")
})

test("chord_replace (totes les aparicions)", () => {
  const r = apply(SONG, item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "Fmaj7", scope: "all" }))
  assertEqual(r.content.match(/<ch>Fmaj7<\/ch>/g)?.length, 3, "tres F canviats")
  assertEqual(r.content.includes("<ch>F</ch>"), false, "cap F")
})

test("chord_replace amb bemolls al report: es compara normalitzat", () => {
  const content = "<ch>A#</ch>hola"
  const r = apply(content, item({ kind: "chord_replace", block: 0, line: content, chord_idx: 0, from: "Bb", to: "Bbm" }))
  assertEqual(r.applied, [1], "aplicat")
})

test("chord_replace amb un acord que no coincideix → mismatch", () => {
  const r = apply(SONG, item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "G", to: "D" }))
  assertEqual(r.failed, [{ id: 1, reason: "mismatch" }], "mismatch")
  assertEqual(r.content, SONG, "sense canvis")
})

test("chord_add i chord_remove a la mateixa línia", () => {
  const r = apply(
    SONG,
    item({ kind: "chord_add", block: 2, line: L[2], offset: 0, chord: "E" }),
    item({ kind: "chord_remove", block: 2, line: L[2], chord_idx: 1, chord: "G" }),
  )
  assertEqual(r.content, withLine(2, "<ch>E</ch>de quin <ch>C</ch>nom no vull recordar"), "content")
})

test("chord_move dins la línia i a una altra línia", () => {
  const r = apply(SONG, item({ kind: "chord_move", block: 1, line: L[1], chord_idx: 1, chord: "F", to_block: 1, to_line: L[1], to_offset: 3 }))
  assertEqual(r.content, withLine(1, "<ch>Am</ch>En <ch>F</ch>un lloc de la Manxa"), "mateixa línia")

  const r2 = apply(SONG, item({ kind: "chord_move", block: 1, line: L[1], chord_idx: 0, chord: "Am", to_block: 2, to_line: L[2], to_offset: 0 }))
  const out = r2.content.split("\n")
  assertEqual(out[1], "En un lloc de la <ch>F</ch>Manxa", "origen")
  assertEqual(out[2], "<ch>Am</ch>de quin <ch>C</ch>nom no vull <ch>G</ch>recordar", "destí")
})

test("Dues correccions sobre el mateix acord → conflict", () => {
  const r = apply(
    SONG,
    item({ kind: "chord_remove", block: 1, line: L[1], chord_idx: 1, chord: "F" }),
    item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "D" }),
  )
  assertEqual(r.applied, [1], "el primer s'aplica")
  assertEqual(r.failed, [{ id: 2, reason: "conflict" }], "el segon no")
})

test("song_key transposa tota la cançó", () => {
  const r = apply("<ch>C</ch>a <ch>G/B</ch>b", item({ kind: "song_key", semitones: 2, from_key: "C", to_key: "D" }))
  assertEqual(r.content, "<ch>D</ch>a <ch>A/C#</ch>b", "content")
  assertEqual(r.keyShift, 2, "keyShift")
})

test("lyric_replace desplaça els acords posteriors", () => {
  // "de quin nom no vull recordar": "nom" = [8, 11)
  const r = apply(SONG, item({ kind: "lyric_replace", block: 2, line: L[2], start: 8, end: 11, from: "nom", to: "nombre" }))
  assertEqual(r.content.split("\n")[2], "de quin <ch>C</ch>nombre no vull <ch>G</ch>recordar", "content")
})

test("lyric_replace: sobra (to buit) i falta (start === end)", () => {
  // L'acord que queia on s'insereix el text continua sobre el mateix caràcter
  const r = apply(
    SONG,
    item({ kind: "lyric_replace", block: 1, line: L[1], start: 0, end: 3, from: "En ", to: "" }),
    item({ kind: "lyric_replace", block: 1, line: L[1], start: 17, end: 17, from: "", to: "gran " }),
  )
  assertEqual(r.content.split("\n")[1], "<ch>Am</ch>un lloc de la gran <ch>F</ch>Manxa", "content")
})

test("lyric_replace amb el text equivocat → mismatch; solapats → conflict", () => {
  const r = apply(SONG, item({ kind: "lyric_replace", block: 2, line: L[2], start: 0, end: 2, from: "xx", to: "y" }))
  assertEqual(r.failed, [{ id: 1, reason: "mismatch" }], "mismatch")
  const r2 = apply(
    SONG,
    item({ kind: "lyric_replace", block: 2, line: L[2], start: 0, end: 5, from: "de qu", to: "a" }),
    item({ kind: "lyric_replace", block: 2, line: L[2], start: 3, end: 7, from: "quin", to: "b" }),
  )
  assertEqual(r2.failed, [{ id: 2, reason: "conflict" }], "conflict")
})

test("lyric_add_line: conserva els acords vàlids i treu la resta de tags", () => {
  const r = apply(SONG, item({ kind: "lyric_add_line", block: 2, line: L[2], text: "<ch>Am</ch>nova <ch>X</ch>lí<b>nia</b>" }))
  assertEqual(r.content.split("\n")[3], "<ch>Am</ch>nova línia", "línia nova")
})

test("Acords sobre el text afegit (lyric_replace amb <ch> al text nou)", () => {
  // "nom" → "<ch>D</ch>nombre": el C original (offset 8) queda al principi del tram i el D nou també
  const r = apply(SONG, item({ kind: "lyric_replace", block: 2, line: L[2], start: 8, end: 11, from: "nom", to: "nom<ch>D</ch>bre" }))
  assertEqual(r.content.split("\n")[2], "de quin <ch>C</ch>nom<ch>D</ch>bre no vull <ch>G</ch>recordar", "content")
})

test("insertChordInText", () => {
  assertEqual(insertChordInText("hola món", 5, "G"), "hola <ch>G</ch>món", "simple")
  assertEqual(insertChordInText("<ch>C</ch>hola món", 0, "G"), "<ch>C</ch><ch>G</ch>hola món", "al mateix lloc, després")
  assertEqual(insertChordInText("ab", 99, "E"), "ab<ch>E</ch>", "al final")
})

test("Seccions: rename, add, remove", () => {
  const r = apply(
    SONG,
    item({ kind: "section_rename", block: 8, line: L[8], from: "Estrofa 2", to: "Pont" }),
    item({ kind: "section_add", block: 6, line: L[6], name: "Pre-tornada" }),
    item({ kind: "section_remove", block: 4, line: L[4], name: "Tornada" }),
  )
  const out = r.content.split("\n")
  assertEqual(out.slice(4, 7), [L[5], "<sec>Pre-tornada</sec>", L[6]], "add/remove")
  assertEqual(out.includes("<sec>Pont</sec>"), true, "rename")
})

test("section_missing copiant una altra secció", () => {
  const r = apply(SONG, item({ kind: "section_missing", block: 8, line: L[8], name: "Tornada", copy_of: { block: 4, line: L[4] } }))
  const out = r.content.split("\n")
  assertEqual(out.slice(8, 13), ["<sec>Tornada</sec>", L[5], L[6], "", L[8]], "secció copiada")

  const r2 = apply(SONG, item({ kind: "section_missing", block: 9, line: L[9], position: "after", name: "Tornada", text: "la la\n" }))
  assertEqual(r2.content.split("\n").slice(9), [L[9], "", "<sec>Tornada</sec>", "la la", ""], "al final, amb text")
})

test("Reancoratge: la línia s'ha mogut", () => {
  const moved = "<sec>Intro</sec>\n<ch>C</ch>\n\n" + SONG // tot baixa 3 línies
  const r = apply(moved, item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "Dm" }))
  assertEqual(r.applied, [1], "aplicat")
  assertEqual(r.content.split("\n")[4], "<ch>Am</ch>En un lloc de la <ch>Dm</ch>Manxa", "a la línia nova")
})

test("Reancoratge: la línia ha canviat → anchor", () => {
  const changed = withLine(1, "<ch>Am</ch>En un lloc de la <ch>F</ch>Mancha")
  const r = apply(changed, item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "Dm" }))
  assertEqual(r.failed, [{ id: 1, reason: "anchor" }], "anchor")
})

test("Línies repetides: tria la més propera a l'índex original", () => {
  const content = "a\n<ch>C</ch>la\nb\nc\nd\n<ch>C</ch>la"
  const r = apply("y\n" + content, item({ kind: "chord_remove", block: 5, line: "<ch>C</ch>la", chord_idx: 0, chord: "C" }))
  assertEqual(r.content, "y\na\n<ch>C</ch>la\nb\nc\nd\nla", "la de baix")
})

test("meta i manuals", () => {
  const r = apply(
    SONG,
    item({ kind: "meta", field: "title", from: "Vell", to: " Nou " }),
    item({ kind: "meta", field: "youtube_broken", from: "https://youtu.be/x", to: "" }),
    item({ kind: "other", text: "hola" }),
  )
  assertEqual(r.meta, { title: "Nou" }, "meta")
  assertEqual(r.failed.map((f) => f.reason), ["manual", "manual"], "manuals")
})

test("dedupeKey i contentHash", () => {
  const a = item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "Bb" })
  const b = item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "A#" })
  const c = item({ kind: "chord_replace", block: 1, line: L[1], chord_idx: 1, from: "F", to: "D" })
  assertEqual(dedupeKey(a), dedupeKey(b), "bemoll = sostingut")
  assertEqual(dedupeKey(a) === dedupeKey(c), false, "acords diferents")
  assertEqual(contentHash(SONG), contentHash(SONG), "hash estable")
  assertEqual(contentHash(SONG) === contentHash(SONG + " "), false, "hash diferent")
})

test("lineDiff", () => {
  const d = lineDiff("a\nb\nc\nd\ne\nf\ng", "a\nb\nc\nX\ne\nf\ng", 1)
  assertEqual(d, [
    { type: "gap", count: 2 },
    { type: "same", text: "c" },
    { type: "del", text: "d" },
    { type: "add", text: "X" },
    { type: "same", text: "e" },
    { type: "gap", count: 2 },
  ], "diff")
})

if (failed) {
  console.error("\nHi ha tests que fallen.")
  process.exit(1)
}
console.log("\nTots els tests passen.")
