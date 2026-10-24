/**
 * src/lib/chords/__tests__/diagram.test.ts
 * Tests dels diagrames d'acords: posició, finestra de trasts, cejilla i ordre.
 * Execució: npx tsx src/lib/chords/__tests__/diagram.test.ts
 */

import { chordDiagram, chordDiagramHtml, chordDiagramSvg, collectChords, sortChords } from "../diagram.js"

let failed = false

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed = true
    console.error(`  FALLA: ${message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed = true
    console.error(`  FALLA: ${label}`)
    console.error(`    esperat: ${JSON.stringify(expected)}`)
    console.error(`    obtingut: ${JSON.stringify(actual)}`)
  }
}

console.log("Posicions obertes")
{
  const c = chordDiagram("C")
  assertEqual(c?.frets, [-1, 3, 2, 0, 1, 0], "C obert")
  assertEqual(c?.baseFret, 1, "C comença al trast 1")
  assertEqual(c?.barre, null, "C sense cejilla")
  assertEqual(chordDiagram("Am")?.frets, [-1, 0, 2, 2, 1, 0], "Am obert")
  assertEqual(chordDiagram("D")?.barre, null, "D sense cejilla")
  assertEqual(chordDiagram("A")?.barre, null, "A sense cejilla")
  assertEqual(chordDiagram("Em")?.barre, null, "Em sense cejilla")
  assertEqual(chordDiagram("G/B")?.frets[0], -1, "G/B apaga la sisena")
  assertEqual(chordDiagram("G/B")?.frets[1], 2, "G/B: Si a la cinquena")
}

console.log("Cejilles")
{
  const f = chordDiagram("F")
  assertEqual(f?.frets, [1, 3, 3, 2, 1, 1], "F forma de Mi")
  assertEqual(f?.barre, { fret: 1, from: 0, to: 5 }, "F cejilla sencera")
  const bm = chordDiagram("Bm")
  assertEqual(bm?.frets, [-1, 2, 4, 4, 3, 2], "Bm forma de La")
  assertEqual(bm?.barre, { fret: 2, from: 1, to: 5 }, "Bm cejilla des de la cinquena")
  assertEqual(bm?.baseFret, 1, "Bm cap a la finestra 1-4")
  const cm = chordDiagram("Cm")
  assertEqual(cm?.baseFret, 3, "Cm: finestra des del trast 3")
  assertEqual(chordDiagram("Ebm")?.frets, chordDiagram("D#m")?.frets, "bemolls = sostinguts")
}

console.log("Extensions i errors")
{
  assertEqual(chordDiagram("C9")?.frets, chordDiagram("C7")?.frets, "C9 → C7")
  assertEqual(chordDiagram("N.C."), null, "N.C. no té diagrama")
  assertEqual(chordDiagram("E→A"), null, "dos acords amb fletxa → null")
  assert(chordDiagram("C#m7(b5)") !== null, "parèntesis permesos")
  assertEqual(chordDiagramHtml("xyz"), null, "acord desconegut → null")
}

console.log("SVG i HTML")
{
  const d = chordDiagram("Cm")
  const svg = d ? chordDiagramSvg(d) : ""
  assert(!/<text|<circle|<line|stroke/.test(svg), "l'SVG només fa servir path i rect plens")
  const html = chordDiagramHtml("Cm", "Dom") ?? ""
  assert(html.includes(">Dom<"), "nom de mostra")
  assert(html.includes("3fr"), "número de trast")
  assert(!(chordDiagramHtml("C") ?? "").includes("chord-fr"), "C sense número de trast")
}

console.log("Llistes")
{
  assertEqual(collectChords("<ch>Am</ch>la <ch>F</ch>li <ch>Am</ch>"), ["Am", "F"], "únics i en ordre")
  assertEqual(sortChords(["G", "Am", "C7", "C", "A", "xx"]), ["C", "C7", "G", "A", "Am", "xx"], "ordre del glossari")
}

if (failed) {
  console.error("\nHi ha tests que fallen.")
  process.exit(1)
}
console.log("\nTot correcte.")
