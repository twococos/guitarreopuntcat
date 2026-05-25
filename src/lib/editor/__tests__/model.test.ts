/**
 * src/lib/editor/__tests__/model.test.ts
 * Tests de parse/serialize del model WYSIWYG.
 * Execució: npx tsx src/lib/editor/__tests__/model.test.ts
 */

import { parse, serialize } from "../model.js"
import type { Doc, Block, Inline } from "../model.js"

// ── Utilitats de test ─────────────────────────────────────────────────────────

let failed = false

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed = true
    console.error(`  FALLA: ${message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    failed = true
    console.error(`  FALLA: ${label}`)
    console.error(`    esperat: ${JSON.stringify(expected)}`)
    console.error(`    rebut:   ${JSON.stringify(actual)}`)
  }
}

function assertRoundTrip(raw: string, label: string): void {
  const result = serialize(parse(raw))
  if (result !== raw) {
    failed = true
    console.error(`  FALLA round-trip: ${label}`)
    console.error(`    original: ${JSON.stringify(raw)}`)
    console.error(`    resultat: ${JSON.stringify(result)}`)
  }
}

function test(name: string, fn: () => void): void {
  console.log(`\n  ${name}`)
  fn()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("Tests model.ts — parse / serialize\n")

// 1. Cançó simple amb 1 estrofa
test("Cançó simple amb 1 estrofa", () => {
  const raw = "<sec>Estrofa 1</sec>\n<ch>Am</ch>En un lloc de la Manxa"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 2, "ha de tenir 2 blocs")
  assertEqual(doc.blocks[0].kind, "section", "primer bloc: section")
  if (doc.blocks[0].kind === "section") {
    assertEqual(doc.blocks[0].name, "Estrofa 1", "nom de la secció")
  }
  assertEqual(doc.blocks[1].kind, "lyric", "segon bloc: lyric")
  assertRoundTrip(raw, "cançó simple 1 estrofa")
})

// 2. Cançó amb seccions + acords intercalats
test("Cançó amb seccions + acords intercalats", () => {
  const raw =
    "<sec>Estrofa 1</sec>\n" +
    "<ch>Am</ch>En un lloc de la <ch>F</ch>Manxa de quin <ch>C</ch>nom no vull\n" +
    "<sec>Tornada</sec>\n" +
    "<ch>G</ch>La la la"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 4, "ha de tenir 4 blocs")
  assertEqual(doc.blocks[0].kind, "section", "bloc 0 section")
  assertEqual(doc.blocks[1].kind, "lyric", "bloc 1 lyric")
  assertEqual(doc.blocks[2].kind, "section", "bloc 2 section")
  assertEqual(doc.blocks[3].kind, "lyric", "bloc 3 lyric")
  if (doc.blocks[1].kind === "lyric") {
    assertEqual(doc.blocks[1].spans.length, 6, "línia amb 3 acords i 3 texts té 6 spans")
    assertEqual(doc.blocks[1].spans[0].kind, "chord", "span 0: chord")
    assertEqual(doc.blocks[1].spans[1].kind, "text", "span 1: text")
  }
  assertRoundTrip(raw, "cançó amb seccions + acords intercalats")
})

// 3. Línia buida entre estrofes
test("Línia buida entre estrofes", () => {
  const raw = "<ch>Am</ch>Lletra\n\n<ch>G</ch>Més lletra"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 3, "ha de tenir 3 blocs")
  assertEqual(doc.blocks[1].kind, "empty", "bloc 1: empty")
  assertRoundTrip(raw, "línia buida entre estrofes")
})

// 4. Acord al principi de línia
test("Acord al principi de línia", () => {
  const raw = "<ch>C</ch>Text a continuació"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 1, "un sol bloc")
  if (doc.blocks[0].kind === "lyric") {
    assertEqual(doc.blocks[0].spans[0].kind, "chord", "primer span és chord")
    if (doc.blocks[0].spans[0].kind === "chord") {
      assertEqual(doc.blocks[0].spans[0].chord, "C", "acord C al principi")
    }
    assertEqual(doc.blocks[0].spans[1].kind, "text", "segon span és text")
  }
  assertRoundTrip(raw, "acord al principi de línia")
})

// 5. Acord al final de línia (sense text posterior)
test("Acord al final de línia", () => {
  const raw = "Text i llavors <ch>Am</ch>"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 1, "un sol bloc")
  if (doc.blocks[0].kind === "lyric") {
    const spans = doc.blocks[0].spans
    assertEqual(spans.length, 2, "dos spans: text + chord")
    assertEqual(spans[0].kind, "text", "primer span: text")
    assertEqual(spans[1].kind, "chord", "segon span: chord final")
    if (spans[1].kind === "chord") {
      assertEqual(spans[1].chord, "Am", "acord Am al final")
    }
  }
  assertRoundTrip(raw, "acord al final de línia")
})

// 6. Múltiples acords consecutius sense text entre ells
test("Múltiples acords consecutius", () => {
  const raw = "<ch>C</ch><ch>G</ch>text final"
  const doc = parse(raw)
  if (doc.blocks[0].kind === "lyric") {
    const spans = doc.blocks[0].spans
    assertEqual(spans.length, 3, "tres spans: chord + chord + text")
    assertEqual(spans[0].kind, "chord", "span 0: chord C")
    if (spans[0].kind === "chord") {
      assertEqual(spans[0].chord, "C", "acord C")
    }
    assertEqual(spans[1].kind, "chord", "span 1: chord G")
    if (spans[1].kind === "chord") {
      assertEqual(spans[1].chord, "G", "acord G")
    }
    assertEqual(spans[2].kind, "text", "span 2: text")
  }
  assertRoundTrip(raw, "múltiples acords consecutius")
})

// 7. Línia de només una secció
test("Línia de només una secció", () => {
  const raw = "<sec>Pont</sec>"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 1, "un sol bloc")
  assertEqual(doc.blocks[0].kind, "section", "bloc de tipus section")
  if (doc.blocks[0].kind === "section") {
    assertEqual(doc.blocks[0].name, "Pont", "nom de la secció")
  }
  assertRoundTrip(raw, "línia de només una secció")
})

// 8. Text amb caràcters especials catalans (apòstrof, accents, ç)
test("Text amb caràcters especials catalans", () => {
  const raw =
    "<sec>Estrofa 1</sec>\n" +
    "<ch>Am</ch>L'àvia té un càntir ple d'açà i el pèl és bé\n" +
    "<ch>F</ch>Però l'ós és gros i la noia és jove i l'únic és això"
  assertRoundTrip(raw, "caràcters especials catalans")
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 3, "3 blocs")
  if (doc.blocks[1].kind === "lyric") {
    const textSpan = doc.blocks[1].spans.find((s) => s.kind === "text")
    assert(textSpan !== undefined, "hi ha un span de text amb accents")
    if (textSpan?.kind === "text") {
      assert(
        textSpan.text.includes("àvia"),
        "el text preserva la à",
      )
    }
  }
})

// 9. Round-trip d'una cançó realista (10-15 versos amb 2-3 seccions)
test("Round-trip cançó realista", () => {
  const cancoProposta = [
    "<sec>Intro</sec>",
    "<ch>Am</ch><ch>F</ch><ch>C</ch><ch>G</ch>",
    "",
    "<sec>Estrofa 1</sec>",
    "<ch>Am</ch>Avui me'n vaig per la <ch>F</ch>riera avall,",
    "<ch>C</ch>amb els ulls oberts i el <ch>G</ch>cor lleial.",
    "<ch>Am</ch>Escolto el vent que <ch>F</ch>porta una can<ch>C</ch>çó antiga,",
    "<ch>G</ch>d'aquells que estimo i que <ch>Am</ch>mai no obligo.",
    "",
    "<sec>Tornada</sec>",
    "<ch>F</ch>Tinc la vida <ch>C</ch>plena de llum,",
    "<ch>G</ch>i el camí és <ch>Am</ch>llarg però no fosc.",
    "<ch>F</ch>Canto per als <ch>C</ch>que no s'aturen,",
    "<ch>G</ch>i per als que <ch>Am</ch>sempre perduren.",
    "",
    "<sec>Estrofa 2</sec>",
    "<ch>Am</ch>La tardor ens <ch>F</ch>treu les fulles daura<ch>C</ch>des,",
    "<ch>G</ch>però al cor hi resten les <ch>Am</ch>paraules amades.",
  ].join("\n")

  assertRoundTrip(cancoProposta, "cançó realista completa")
  const doc = parse(cancoProposta)
  assertEqual(
    doc.blocks.filter((b) => b.kind === "section").length,
    4,
    "4 seccions (Intro, Estrofa 1, Tornada, Estrofa 2)",
  )
  assertEqual(
    doc.blocks.filter((b) => b.kind === "empty").length,
    3,
    "3 línies buides",
  )
  const lyricBlocks = doc.blocks.filter((b) => b.kind === "lyric")
  assert(lyricBlocks.length > 0, "hi ha blocs de lletra")

  // Comprova que la línia d'acords de l'intro (4 acords sense text) és correcta
  const introLyric = doc.blocks[1]
  if (introLyric.kind === "lyric") {
    const chords = introLyric.spans.filter((s) => s.kind === "chord")
    assertEqual(chords.length, 4, "la línia d'intro té 4 acords")
    assert(
      introLyric.spans.every((s) => s.kind === "chord"),
      "tots els spans de l'intro son chord (sense text entre ells)",
    )
  }
})

// 10. Secció amb espais interiors (nom amb espais)
test("Secció amb nom que té espais", () => {
  const raw = "<sec>Pre-tornada 1</sec>"
  const doc = parse(raw)
  assertEqual(doc.blocks[0].kind, "section", "section")
  if (doc.blocks[0].kind === "section") {
    assertEqual(doc.blocks[0].name, "Pre-tornada 1", "nom amb guió i número")
  }
  assertRoundTrip(raw, "secció amb espais al nom")
})

// 11. Múltiples línies buides consecutives
test("Múltiples línies buides consecutives", () => {
  const raw = "Lletra\n\n\nMés lletra"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 4, "4 blocs")
  assertEqual(doc.blocks[1].kind, "empty", "bloc 1 buit")
  assertEqual(doc.blocks[2].kind, "empty", "bloc 2 buit")
  assertRoundTrip(raw, "múltiples línies buides consecutives")
})

// 12. Línia de text pur (sense cap acord)
test("Línia de text pur sense acords", () => {
  const raw = "Aquesta línia no té cap acord"
  const doc = parse(raw)
  assertEqual(doc.blocks.length, 1, "un sol bloc")
  assertEqual(doc.blocks[0].kind, "lyric", "lyric")
  if (doc.blocks[0].kind === "lyric") {
    assertEqual(doc.blocks[0].spans.length, 1, "un sol span de text")
    assertEqual(doc.blocks[0].spans[0].kind, "text", "text")
    if (doc.blocks[0].spans[0].kind === "text") {
      assertEqual(doc.blocks[0].spans[0].text, raw, "text idèntic")
    }
  }
  assertRoundTrip(raw, "línia de text pur")
})

// ── Resultat final ─────────────────────────────────────────────────────────────

console.log("")
if (failed) {
  console.error("Hi ha tests fallits. Revisa els errors de dalt.")
  process.exit(1)
} else {
  console.log("✓ Tots els tests han passat")
}
