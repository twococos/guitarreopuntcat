/**
 * src/lib/transcriber/__tests__/sync.test.ts
 * Tests de syncAnalysis() amb anàlisis sintètiques (sense àudio).
 * Execució: npx tsx src/lib/transcriber/__tests__/sync.test.ts
 */

import { syncAnalysis } from "../sync.js"
import type { SyncResult } from "../sync.js"
import { chordClass, decodeEntities, normalize, similarity } from "../syncText.js"
import type { AnalysisCompact } from "../../schemas/transcriber.js"

// ── Utilitats de test ─────────────────────────────────────────────────────────

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
    console.error(`    rebut:   ${JSON.stringify(actual)}`)
  }
}

function test(name: string, fn: () => void): void {
  console.log(`\n  ${name}`)
  fn()
}

/** Anàlisi a 120 bpm (pulsació cada 500 ms) en 4/4. Paraules sense conf: "no sentides". */
function analysis(
  words: [number, number, string, (number | null)?][],
  chords: [number, number, string][],
  durationMs = 20000,
): AnalysisCompact {
  const n = Math.floor(durationMs / 500)
  return {
    v: 2,
    source: { youtube_id: "test", duration_s: durationMs / 1000 },
    meta: { title: "Prova", artist: "Prova", language: "ca" },
    key: null,
    capo: 0,
    tempo: { bpm: 120, time_signature: [4, 4] },
    beats: {
      dt: Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 500)),
      downbeats: Array.from({ length: Math.ceil(n / 4) }, (_, i) => i * 4),
    },
    chords: chords.map(([s, e, l]) => [s, e, l, 0.9, null] as [number, number, string, number, null]),
    words: words.map(([s, e, t, c]) => [s, e, t, c === undefined ? 0.9 : c]),
    lines: [],
    sections: [],
    lyrics_source: "db",
    models: {},
    stage_times_s: {},
    warnings: [],
  }
}

/** Paraules seguides a partir de `t0`, 400 ms cadascuna amb 100 ms de separació. */
function sung(text: string, t0: number): [number, number, string][] {
  return text.split(" ").map((w, i) => [t0 + i * 500, t0 + i * 500 + 400, w])
}

function chordTimes(r: SyncResult): [string, number, boolean][] {
  return r.occurrences.flatMap((o) => o.chords.map((c) => [c.label, c.t, c.match] as [string, number, boolean]))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("Tests sync.ts — sincronització anàlisi ↔ content\n")

const BASE_WORDS = [...sung("Hola com estàs avui", 2000), ...sung("molt bé gràcies", 5000)]
const BASE_CHORDS: [number, number, string][] = [
  [0, 2000, "C"],
  [2000, 3000, "Am"],
  [3000, 5000, "F"],
  [5000, 8000, "G"],
]
const BASE = analysis(BASE_WORDS, BASE_CHORDS, 10000)

test("Utilitats de text", () => {
  assertEqual(normalize("L'avi, col·legi!"), ["l", "avi", "col·legi"], "normalize")
  assertEqual(decodeEntities("l&rsquo;aire &Eacute;s"), "l’aire És", "entitats amb nom i accents")
  assertEqual(decodeEntities("l&rsquo"), "l’", "entitat sense punt i coma")
  assertEqual(similarity("casa", "casa"), 1, "similitud igual")
  assert(similarity("cantar", "cantava") > 0.6, "similitud aproximada")
  assertEqual(chordClass("F#m7"), { root: 6, minor: true }, "F#m7")
  assertEqual(chordClass("Bbmaj7"), { root: 10, minor: false }, "Bbmaj7")
  assertEqual(chordClass("A/DO#"), { root: 9, minor: false }, "baix en solfeig")
  assertEqual(chordClass("x2"), null, "no és un acord")
})

test("Content igual que l'anàlisi", () => {
  const r = syncAnalysis(BASE, "<ch>Am</ch>Hola com <ch>F</ch>estàs avui\n<ch>G</ch>molt bé gràcies")
  assertEqual(r.quality, { coverage: 1, words: 1, chords: 1, ok: true }, "qualitat")
  assertEqual(r.transpose, 0, "sense transport")
  assertEqual(r.occurrences.length, 2, "dues línies")
  assertEqual(r.occurrences[0].start, 2000, "inici de la primera línia")
  assertEqual(r.occurrences[1].end, 6400, "fi de la segona línia")
  assertEqual(chordTimes(r), [["Am", 2000, true], ["F", 3000, true], ["G", 5000, true]], "temps dels acords")
  assertEqual(r.report, { unsungLines: [], missingSpans: [], chordMismatches: [] }, "informe buit")
})

test("Acord mogut una paraula: s'ajusta al canvi real", () => {
  // F escrit a "com" (comença a 2500 ms); el canvi a F és a 3000 ms, dins la finestra d'1,5 pulsacions
  const r = syncAnalysis(BASE, "<ch>Am</ch>Hola <ch>F</ch>com estàs avui\n<ch>G</ch>molt bé gràcies")
  assertEqual(chordTimes(r)[1], ["F", 3000, true], "F enganxat al canvi")
})

test("Acord al mig d'una paraula: temps proporcional a la lletra", () => {
  const an = analysis(sung("Siset", 1000), [[0, 10000, "C"]], 10000)
  const r = syncAnalysis(an, "Sis<ch>C</ch>et")
  const t = r.occurrences[0].chords[0].t
  assert(t > 1000 && t < 1400, `dins la paraula (${t})`)
})

test("Acord que no concorda: surt a l'informe amb el que sona", () => {
  const r = syncAnalysis(BASE, "<ch>Am</ch>Hola com <ch>D</ch>estàs avui\n<ch>G</ch>molt bé gràcies")
  const d = r.occurrences[0].chords[1]
  assertEqual([d.label, d.match, d.heard], ["D", false, "F"], "D no concorda; sona F")
  assertEqual(r.report.chordMismatches.length, 1, "un desacord")
  assertEqual(r.quality.chords, 0.667, "qualitat d'acords")
})

test("Transport: content amb capo 2", () => {
  const capo2 = "<ch>Gm</ch>Hola com <ch>D#</ch>estàs avui\n<ch>F</ch>molt bé gràcies"
  const r = syncAnalysis(BASE, capo2, 2)
  assertEqual(r.transpose, 2, "transport 2")
  assertEqual(r.quality.chords, 1, "tots concorden")
  const r0 = syncAnalysis(BASE, capo2, 0)
  assertEqual(r0.transpose, 2, "detectat sense saber el capo")
})

test("Marca x2: repeteix el bloc des de la secció", () => {
  const an = analysis([...sung("la vida és bella", 1000), ...sung("la vida és bella", 4000)], [[0, 8000, "C"]])
  const r = syncAnalysis(an, "<sec>Tornada</sec>\n<ch>C</ch>la vida és bella\nx2")
  assertEqual(r.occurrences.map((o) => [o.block, o.rep, o.start]), [[1, 0, 1000], [1, 1, 4000]], "dues ocurrències")
  assertEqual(r.sections.map((s) => [s.block, s.rep, s.start, s.end]), [[0, 0, 1000, 2900], [0, 1, 4000, 5900]], "dues tornades")
  assertEqual(r.quality.words, 1, "totes les paraules")
})

test("Marca (x2) al final d'una línia", () => {
  const an = analysis([...sung("oh oh oh", 1000), ...sung("oh oh oh", 3000)], [[0, 8000, "C"]])
  const r = syncAnalysis(an, "oh oh oh (x2)")
  assertEqual(r.occurrences.length, 2, "dues ocurrències")
  assertEqual(r.occurrences[1].words.length, 3, "sense la marca com a paraula")
})

test("Línia afegida que no es canta", () => {
  const r = syncAnalysis(BASE, "Hola com estàs avui\nAquesta línia no es canta mai\nmolt bé gràcies")
  assertEqual(r.report.unsungLines, [{ block: 1, rep: 0 }], "línia no cantada")
  assertEqual(r.quality.coverage, 0.538, "cobertura: 7 de 13 subparaules")
  assertEqual(r.quality.words, 1, "el que es canta, tot sentit")
  assertEqual(r.occurrences.length, 2, "les altres dues tenen temps")
  assertEqual(r.occurrences[1].start, 5000, "la següent no es mou")
})

test("Estrofa que falta al content", () => {
  const an = analysis([...sung("Hola com estàs avui", 2000), ...sung("una estrofa que no hi és", 5000)], BASE_CHORDS)
  const r = syncAnalysis(an, "Hola com estàs avui")
  assertEqual(r.report.missingSpans.map((s) => [s.start, s.text]), [[5000, "una estrofa que no hi és"]], "tram que falta")
})

test("Faltes, accents i entitats al content", () => {
  const r = syncAnalysis(BASE, "Hola, com estas avui?\nmolt be gracies")
  assertEqual(r.quality.words, 1, "coincidència aproximada")
  const an = analysis(sung("robar-me l’aire", 1000), [[0, 5000, "C"]], 5000)
  assertEqual(syncAnalysis(an, "robar-me l&rsquo;aire").quality.words, 1, "entitat HTML")
})

test("Paraules no sentides per l'ASR no compten per a la qualitat", () => {
  const words: [number, number, string, number | null][] = sung("Hola com estàs avui", 2000).map(
    ([s, e, t], i) => [s, e, t, i < 2 ? 0.9 : null],
  )
  const r = syncAnalysis(analysis(words, BASE_CHORDS), "Hola com estàs avui")
  assertEqual(r.quality.words, 0.5, "només la meitat sentides")
})

test("Línia només d'acords (intro) i cadena d'acords", () => {
  const an = analysis(sung("Hola com estàs avui", 4000), [
    [0, 1000, "C"],
    [1000, 2000, "G"],
    [2000, 3000, "Am"],
    [3000, 4000, "F"],
    [4000, 8000, "C"],
  ])
  const r = syncAnalysis(an, "<sec>Intro</sec>\n<ch>C</ch>  <ch>G→Am</ch>  <ch>F</ch>\n<ch>C</ch>Hola com estàs avui")
  assertEqual(r.occurrences[0].block, 1, "la intro és la primera ocurrència")
  assertEqual(
    r.occurrences[0].chords.map((c) => [c.label, c.sub, c.t, c.match]),
    [["C", 0, 0, true], ["G", 0, 1000, true], ["Am", 1, 2000, true], ["F", 0, 3000, true]],
    "acords de la intro",
  )
  assertEqual(r.sections[0].block, 0, "secció Intro")
})

test("Intro escrita un cop i tocada dues vegades: casa amb la primera", () => {
  const an = analysis(sung("Hola com estàs avui", 8000), [
    [0, 1000, "C"], [1000, 2000, "G"], [2000, 3000, "Am"], [3000, 4000, "F"],
    [4000, 5000, "C"], [5000, 6000, "G"], [6000, 7000, "Am"], [7000, 8000, "F"],
    [8000, 12000, "C"],
  ])
  const r = syncAnalysis(an, "<ch>C</ch> <ch>G</ch> <ch>Am</ch> <ch>F</ch>\n<ch>C</ch>Hola com estàs avui")
  assertEqual(r.occurrences[0].chords.map((c) => c.t), [0, 1000, 2000, 3000], "primera volta")
  assertEqual(r.occurrences[0].end, 8000, "la línia dura fins a la lletra")
})

test("Cadena dins una línia amb lletra", () => {
  const r = syncAnalysis(BASE, "<ch>Am→F</ch>Hola com estàs avui\n<ch>G</ch>molt bé gràcies")
  assertEqual(chordTimes(r).slice(0, 2), [["Am", 2000, true], ["F", 3000, true]], "Am i després F")
})

test("Content sense anàlisi de lletra", () => {
  const an = analysis([], BASE_CHORDS, 10000)
  const r = syncAnalysis(an, "Hola com estàs avui")
  assertEqual(r.quality.ok, false, "sense paraules, no hi ha reproducció")
  assertEqual(r.report.unsungLines.length, 1, "la línia queda sense temps")
})

// ── Resultat final ─────────────────────────────────────────────────────────────

console.log("")
if (failed) {
  console.error("Hi ha tests fallits. Revisa els errors de dalt.")
  process.exit(1)
} else {
  console.log("✓ Tots els tests han passat")
}
