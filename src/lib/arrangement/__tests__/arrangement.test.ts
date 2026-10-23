/**
 * src/lib/arrangement/__tests__/arrangement.test.ts
 * Tests de l'arranjament ràpid: recepta → content, reancoratge, goma i pla de reproducció.
 * Execució: npx tsx src/lib/arrangement/__tests__/arrangement.test.ts
 */

import { applyArrangement, arrangeContent, splitSections } from "../apply.js"
import {
  editableArrangement,
  identityArrangement,
  isIdentity,
  missingSections,
  moveItem,
  removeItem,
  repeatItem,
  restoreSection,
  toggleChord,
  toggleLine,
  toggleText,
} from "../edit.js"
import { buildPlaybackPlan, isLinearPlan, toOriginal, virtualizeTimeline } from "../plan.js"
import { parse } from "../../editor/model.js"
import type { Timeline, Pulse, TimedChord } from "../../player/timeline.js"
import { quickArrangementSchema } from "../../schemas/arrangement.js"

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

// b0 sec E1 · b1 · b2 · b3 buida · b4 sec T · b5 · b6
const SONG = [
  "<sec>Estrofa 1</sec>",
  "<ch>C</ch>Hola que <ch>Am</ch>tal",
  "<ch>G</ch>molt bé",
  "",
  "<sec>Tornada</sec>",
  "<ch>F</ch>la la la",
  "<ch>C</ch>lo lo lo",
].join("\n")

const WITH_INTRO = "<ch>D</ch>intro parlada\n\n" + SONG

// ── Contingut ─────────────────────────────────────────────────────────────────

test("seccions i «Inici»", () => {
  assertEqual(splitSections(parse(SONG)).map((s) => s.sec), [0, 4], "dues seccions")
  const intro = splitSections(parse(WITH_INTRO))
  assertEqual(intro.map((s) => s.sec), [-1, 2, 6], "amb línies abans del primer <sec>")
  assertEqual(intro[0].name, "", "«Inici» sense nom")
})

test("identitat", () => {
  const qa = identityArrangement(SONG)
  assert(isIdentity(SONG, qa), "la recepta inicial no canvia res")
  assertEqual(applyArrangement(SONG, qa), SONG, "el content queda igual")
  assert(quickArrangementSchema.safeParse(qa).success, "valida amb Zod")
})

test("reordenar, repetir i treure", () => {
  const id = identityArrangement(SONG)
  const rev = moveItem(id, 1, 0)
  assertEqual(
    applyArrangement(SONG, rev),
    ["<sec>Tornada</sec>", "<ch>F</ch>la la la", "<ch>C</ch>lo lo lo", "", "<sec>Estrofa 1</sec>", "<ch>C</ch>Hola que <ch>Am</ch>tal", "<ch>G</ch>molt bé"].join("\n"),
    "tornada primer",
  )
  const rep = repeatItem(id, 1)
  assertEqual(rep.items.map((i) => i.sec), [0, 4, 4], "repetida just a sota")
  const out = arrangeContent(SONG, rep)
  assertEqual(out.heads, [0, 4, 8], "on comença cada ítem")
  assertEqual(out.origin[9], { item: 2, block: 5, spans: [0, 1] }, "origen de la 2a tornada")
  const removed = removeItem(id, 0)
  assertEqual(applyArrangement(SONG, removed), "<sec>Tornada</sec>\n<ch>F</ch>la la la\n<ch>C</ch>lo lo lo", "sense l'estrofa")
  assertEqual(missingSections(SONG, removed), [{ sec: 0, name: "Estrofa 1" }], "secció treta")
  assertEqual(restoreSection(SONG, removed, 0).items.map((i) => i.sec), [0, 4], "torna al seu lloc")
  assertEqual(removeItem(removeItem(id, 0), 0).items.length, 1, "sempre en queda una")
})

test("goma: text, acords i versos", () => {
  let qa = identityArrangement(SONG)
  qa = toggleText(SONG, qa, 0, 1, 5, 9) // «que »
  assertEqual(arrangeContent(SONG, qa).content.split("\n")[1], "<ch>C</ch>Hola <ch>Am</ch>tal", "paraula esborrada")
  qa = toggleText(SONG, qa, 0, 1, 5, 9)
  assert(isIdentity(SONG, qa), "tornar-hi la desfà")

  qa = toggleChord(SONG, identityArrangement(SONG), 0, 1, 0)
  const out = arrangeContent(SONG, qa)
  assertEqual(out.content.split("\n")[1], "Hola que <ch>Am</ch>tal", "acord esborrat")
  assertEqual(out.origin[1]?.spans, [-1, -1, 1, -1], "mapa d'spans (només acords): el C ja no hi és, l'Am és el span 1")

  qa = toggleLine(SONG, identityArrangement(SONG), 0, 2)
  assertEqual(arrangeContent(SONG, qa).content.split("\n").slice(0, 3), ["<sec>Estrofa 1</sec>", "<ch>C</ch>Hola que <ch>Am</ch>tal", ""], "vers esborrat")

  // Text esborrat amb un acord a dins: l'acord es queda al punt del tall
  qa = toggleText(SONG, identityArrangement(SONG), 0, 1, 5, 12)
  assertEqual(arrangeContent(SONG, qa).content.split("\n")[1], "<ch>C</ch>Hola <ch>Am</ch>", "acord dins el tram")

  // Repetició amb marques pròpies
  qa = toggleChord(SONG, repeatItem(identityArrangement(SONG), 1), 2, 5, 0)
  const lines = applyArrangement(SONG, qa).split("\n")
  assertEqual([lines[5], lines[9]], ["<ch>F</ch>la la la", "la la la"], "només la 2a tornada sense acords")
})

test("reancoratge", () => {
  let qa = toggleLine(SONG, moveItem(identityArrangement(SONG), 1, 0), 0, 6)
  const changed = "<sec>Intro</sec>\n<ch>E</ch>nova\n\n" + SONG
  const r = arrangeContent(changed, qa)
  assertEqual(r.lost, 0, "tot es reancora")
  assert(r.content.startsWith("<sec>Tornada</sec>\n<ch>F</ch>la la la\n\n<sec>Estrofa 1</sec>"), "mateix ordre, sense el vers")
  const edited = SONG.replace("lo lo lo", "lu lu lu")
  assertEqual(arrangeContent(edited, qa).lost, 1, "la línia canviada es perd")
  const ed = editableArrangement(edited, qa)
  assertEqual(ed.lost, 1, "el diàleg n'avisa")
  assert(ed.qa.items.every((i) => !i.erase), "i la marca ja no hi és")
  qa = { ...qa, items: [{ sec: 4, name: "Pont" }] }
  assertEqual(arrangeContent(SONG, qa).items.length, 0, "una secció que no existeix")
})

// ── Pla de reproducció ────────────────────────────────────────────────────────

/** Cronologia falsa de SONG: compàs de 2 s (4 × 500 ms), estrofa a 4-8 s, tornada a 10-14 s. */
function timeline(): Timeline {
  const pulses: Pulse[] = []
  for (let t = 0, i = 0; t < 40000; t += 500, i++) {
    pulses.push({ t, dur: 500, bar: Math.floor(i / 4) + 1, inBar: i % 4, perBar: 4 })
  }
  const occ = (block: number, start: number, chord: string) => ({
    block,
    rep: 0,
    start,
    end: start + 1800,
    words: [[start, start + 500, true]] as [number, number, boolean][],
    chords: [{ span: 0, sub: 0, label: chord, t: start, match: true }],
  })
  const occurrences = [occ(1, 4000, "C"), occ(2, 6000, "G"), occ(5, 10000, "F"), occ(6, 12000, "C")]
  const chords: TimedChord[] = occurrences.map((o, i) => ({ t: o.start, label: o.chords[0].label, source: "content", occ: i, span: 0, sub: 0 }))
  chords.push({ t: 14500, label: null, source: "analysis", occ: -1, span: -1, sub: 0 })
  return {
    duration: 40000,
    beats: pulses.map((p) => ({ t: p.t, downbeat: p.inBar === 0 })),
    pulses,
    compound: false,
    pulsesPerBar: 4,
    bpm: 120,
    barMs: 2000,
    chords,
    occurrences,
    sections: [
      { block: 0, rep: 0, start: 4000, end: 7800 },
      { block: 4, rep: 0, start: 10000, end: 13800 },
    ],
    firstChordT: 4000,
    transpose: 0,
  }
}

test("pla: identitat", () => {
  const tl = timeline()
  const plan = buildPlaybackPlan(tl, arrangeContent(SONG, identityArrangement(SONG)))
  assertEqual(plan.segments.map((s) => [s.from, s.to]), [[0, 10000], [10000, 40000]], "intro inclosa i seguit")
  assert(isLinearPlan(plan, tl), "sense salts")
})

test("pla: salts i ajust a compàs", () => {
  const tl = timeline()
  const qa = repeatItem(moveItem(identityArrangement(SONG), 1, 0), 0) // T, T, E1
  const arranged = arrangeContent(SONG, qa)
  const plan = buildPlaybackPlan(tl, arranged)
  assertEqual(plan.segments.map((s) => [s.item, s.from, s.to, s.at]), [[0, 10000, 40000, 0], [1, 10000, 40000, 30000], [2, 4000, 10000, 60000]], "segments")
  assertEqual(plan.duration, 66000, "durada")
  assertEqual(toOriginal(plan, 61000), { seg: 2, t: 5000 }, "virtual → original")

  const vtl = virtualizeTimeline(tl, plan, arranged)
  assertEqual(vtl.duration, 66000, "durada virtual")
  assertEqual(vtl.occurrences.map((o) => [o.block, o.start]), [[1, 0], [2, 2000], [5, 30000], [6, 32000], [9, 60000], [10, 62000]], "ocurrències als blocs arranjats")
  assertEqual(vtl.sections.map((s) => [s.block, s.start]), [[0, 0], [4, 30000], [8, 60000]], "una secció per ítem")
  const content = vtl.chords.filter((c) => c.source === "content").map((c) => [c.label, c.t, vtl.occurrences[c.occ].block])
  assertEqual(content, [["F", 0, 1], ["C", 2000, 2], ["F", 30000, 5], ["C", 32000, 6], ["C", 60000, 9], ["G", 62000, 10]], "acords del content")
  assert(vtl.pulses.every((p, i) => i === 0 || p.t > vtl.pulses[i - 1].t), "pulsacions en ordre")
  assertEqual(vtl.pulses.filter((p) => p.inBar === 0).length, 33, "compassos sencers")
})

test("pla: vers esborrat i arrencada a mig compàs", () => {
  const tl = timeline()
  let qa = toggleLine(SONG, identityArrangement(SONG), 0, 2)
  let plan = buildPlaybackPlan(tl, arrangeContent(SONG, qa))
  assertEqual(plan.segments.map((s) => [s.from, s.to]), [[0, 6000], [10000, 40000]], "el vers es talla fins a la secció següent")

  // Una secció que comença a mig compàs: el salt va a l'inici del compàs
  const late = timeline()
  late.sections[1] = { ...late.sections[1], start: 10700 }
  late.occurrences[2] = { ...late.occurrences[2], start: 10700 }
  qa = moveItem(identityArrangement(SONG), 1, 0)
  plan = buildPlaybackPlan(late, arrangeContent(SONG, qa))
  assertEqual(plan.segments.map((s) => [s.from, s.to]), [[10000, 40000], [4000, 10000]], "ajustat a compàs")
})

test("pla: secció sense sincronitzar", () => {
  const tl = timeline()
  tl.sections = tl.sections.slice(0, 1)
  const plan = buildPlaybackPlan(tl, arrangeContent(SONG, identityArrangement(SONG)))
  assertEqual(plan.unsynced, [1], "la tornada no té temps")
  assertEqual(plan.segments.length, 1, "només l'estrofa")
})

if (failed) {
  console.error("\nHi ha tests que fallen.")
  process.exit(1)
}
console.log("\nTots els tests passen.")
