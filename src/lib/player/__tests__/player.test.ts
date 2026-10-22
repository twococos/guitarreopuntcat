/**
 * src/lib/player/__tests__/player.test.ts
 * Tests del motor pur del reproductor: estils, posicions, cronologia i arranjament.
 * Execució: npx tsx src/lib/player/__tests__/player.test.ts
 */

import { STYLES, STYLE_IDS, defaultStyle, effectiveStyle, tokens } from "../styles.js"
import { parseChord, voicingFor, topStrings, TUNING } from "../voicings.js"
import { buildGrid, buildTimeline, barStartAt, indexAt, occurrenceAt } from "../timeline.js"
import { arrange } from "../arrange.js"
import { syncAnalysis } from "../../transcriber/sync.js"
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

/** Anàlisi amb temps regulars de `ibi` ms. `downbeats` per defecte: cada `perBar` temps des de 0. */
function analysis(opts: {
  chords: [number, number, string][]
  words?: [number, number, string][]
  durationMs?: number
  ibi?: number
  ts?: [number, number]
  downbeats?: number[]
  firstBeat?: number
}): AnalysisCompact {
  const ibi = opts.ibi ?? 500
  const duration = opts.durationMs ?? 20000
  const ts = opts.ts ?? [4, 4]
  const first = opts.firstBeat ?? 0
  const n = Math.floor((duration - first) / ibi)
  return {
    v: 2,
    source: { youtube_id: "test", duration_s: duration / 1000 },
    meta: { title: "Prova", artist: "Prova", language: "ca" },
    key: null,
    capo: 0,
    tempo: { bpm: 60000 / ibi, time_signature: ts },
    beats: {
      dt: Array.from({ length: n }, (_, i) => (i === 0 ? first : ibi)),
      downbeats: opts.downbeats ?? Array.from({ length: Math.ceil(n / ts[0]) }, (_, i) => i * ts[0]),
    },
    chords: opts.chords.map(([s, e, l]) => [s, e, l, 0.9, null] as [number, number, string, number, null]),
    words: (opts.words ?? []).map(([s, e, t]) => [s, e, t, 0.9] as [number, number, string, number]),
    lines: [],
    sections: [],
    lyrics_source: "db",
    models: {},
    stage_times_s: {},
    warnings: [],
  }
}

function sung(text: string, t0: number): [number, number, string][] {
  return text.split(" ").map((w, i) => [t0 + i * 500, t0 + i * 500 + 400, w])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("Tests del reproductor — motor pur\n")

test("Catàleg d'estils: patrons ben formats", () => {
  assertEqual(STYLE_IDS.length, 15, "15 estils")
  for (const id of STYLE_IDS) {
    const s = STYLES[id]
    assertEqual(s.id, id, `${id}: id coherent`)
    const n = s.pulses * s.sub
    assertEqual(tokens(s.guitar).length, n, `${id}: fitxes de guitarra`)
    assertEqual(tokens(s.bass).length, n, `${id}: fitxes de baix`)
    assertEqual(tokens(s.perc).length, n, `${id}: fitxes de percussió`)
  }
  assertEqual(tokens("D! . u"), [{ sym: "D", accent: true }, { sym: ".", accent: false }, { sym: "u", accent: false }], "accent")
})

test("Estil per defecte i efectiu", () => {
  assertEqual(defaultStyle(4, false, 120), "pop", "4/4 viu → pop")
  assertEqual(defaultStyle(4, false, 70), "balada", "4/4 lent → balada")
  assertEqual(defaultStyle(3, false, 150), "vals", "3/4 → vals")
  assertEqual(defaultStyle(2, true, 50), "compost-arpegi", "6/8 lent")
  assertEqual(defaultStyle(2, true, 80), "compost-rasgueig", "6/8 viu")
  assertEqual(effectiveStyle("rumba", "pop", "balada"), { id: "rumba", source: "fixed" }, "el fixat mana")
  assertEqual(effectiveStyle(null, "havanera", "balada"), { id: "havanera", source: "detected" }, "detectat")
  assertEqual(effectiveStyle("xyz", "desconegut", "balada"), { id: "balada", source: "default" }, "IDs desconeguts → per defecte")
})

test("Acords: qualitats i baixos", () => {
  assertEqual(parseChord("Am"), { root: 9, quality: "m", bass: null }, "Am")
  assertEqual(parseChord("Bbmaj7")?.quality, "maj7", "Bbmaj7")
  assertEqual(parseChord("F#m7b5")?.quality, "m7b5", "F#m7b5")
  assertEqual(parseChord("C9")?.quality, "7", "C9 → 7")
  assertEqual(parseChord("Em9")?.quality, "m7", "Em9 → m7")
  assertEqual(parseChord("Dsus")?.quality, "sus4", "Dsus → sus4")
  assertEqual(parseChord("Cmaj")?.quality, "maj", "Cmaj → maj")
  assertEqual(parseChord("C/E"), { root: 0, quality: "maj", bass: 4 }, "C/E")
  assertEqual(parseChord("C/C")?.bass, null, "baix igual a l'arrel")
  assertEqual(parseChord("N"), null, "no és un acord")
})

test("Posicions: obertes, cejilles i baix", () => {
  const c = voicingFor("C")!
  assertEqual(c.strings, [null, 48, 52, 55, 60, 64], "C obert")
  assertEqual(c.root, 1, "baix del C a la cinquena")
  const fsm = voicingFor("F#m")!
  assertEqual(fsm.strings, [42, 49, 54, 57, 61, 66], "F#m: cejilla de Mi al 2")
  const bb = voicingFor("Bb")!
  assertEqual(bb.strings[0], null, "Bb: forma de La (sense sisena)")
  assertEqual(bb.strings[1], 46, "Bb: arrel al trast 1 de la cinquena")
  const ce = voicingFor("C/E")!
  assertEqual(ce.strings[0], 40, "C/E: Mi greu a la sisena a l'aire")
  assertEqual(ce.root, 0, "C/E: el baix és la sisena")
  const d = voicingFor("D")!
  assertEqual(topStrings(d, 3), [3, 4, 5], "D: tres cordes agudes")
  // Totes les notes de totes les qualitats estan dins el registre de la guitarra
  for (const q of ["", "m", "7", "maj7", "m7", "m7b5", "dim", "dim7", "aug", "sus4", "sus2", "7sus4", "6", "m6", "add9", "5"]) {
    for (const r of ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) {
      const v = voicingFor(r + q)
      assert(v !== null, `${r}${q}: té posició`)
      if (!v) continue
      const notes = v.strings.filter((n): n is number => n !== null)
      assert(notes.length >= 2, `${r}${q}: almenys dues cordes`)
      assert(notes.every((n, i) => n >= TUNING[0] && n <= TUNING[5] + 12 && (i === 0 || true)), `${r}${q}: registre`)
      const pcs = new Set(notes.map((n) => n % 12))
      assert(pcs.has(parseChord(r + q)!.root), `${r}${q}: hi sona l'arrel`)
    }
  }
})

test("Graella: compassos, anacrusi i 6/8", () => {
  // 4/4 amb anacrusi d'un temps: el primer temps fort és el temps 1
  const a = analysis({ chords: [], durationMs: 6000, downbeats: [1, 5, 9] })
  const g = buildGrid(a)
  assertEqual(g.pulses[0].inBar, 3, "anacrusi: l'últim temps del compàs")
  assertEqual(g.pulses[0].bar, 0, "anacrusi: compàs 0")
  assertEqual([g.pulses[1].bar, g.pulses[1].inBar], [1, 0], "primer temps fort")
  assertEqual(g.pulses[2].inBar, 1, "segon temps")

  // 6/8: corxeres de 250 ms, 6 per compàs → 2 pulsacions de 750 ms per compàs
  const b = analysis({ chords: [], durationMs: 6000, ibi: 250, ts: [6, 8] })
  const g6 = buildGrid(b)
  assert(g6.compound, "6/8 és compost")
  assertEqual(g6.pulsesPerBar, 2, "2 pulsacions per compàs")
  assertEqual(g6.pulses.slice(0, 3).map((p) => [p.t, p.inBar]), [[0, 0], [750, 1], [1500, 0]], "pulsacions cada 3 corxeres")
  assertEqual(g6.pulses[0].dur, 750, "durada de la pulsació")

  // Compàs irregular: un compàs de 2 temps enmig del 4/4
  const c = analysis({ chords: [], durationMs: 6000, downbeats: [0, 4, 6, 10] })
  const gc = buildGrid(c)
  const bar2 = gc.pulses.filter((p) => p.bar === 2)
  assertEqual(bar2.map((p) => p.inBar), [0, 1], "compàs irregular de 2")
  assertEqual(bar2[0].perBar, 2, "perBar del compàs irregular")
})

const WORDS = [...sung("Hola com estàs avui", 6000), ...sung("molt bé gràcies", 10000)]
const CHORDS: [number, number, string][] = [
  [0, 6000, "E"],
  [6000, 8000, "Am"],
  [8000, 10000, "F"],
  [10000, 14000, "G"],
  [14000, 24000, "C"],
]

test("Cronologia: acords del content, farciment i aturades", () => {
  const an = analysis({ chords: CHORDS, words: WORDS, durationMs: 24000 })
  const content = "<ch>Am</ch>Hola com <ch>F</ch>estàs avui\n<ch>G</ch>molt bé gràcies"
  const sync = syncAnalysis(an, content)
  const tl = buildTimeline(an, sync)
  const labels = tl.chords.map((c) => [c.label, c.source])
  // Intro de 3 compassos (6 s) sense acords escrits → la de l'anàlisi (E); final llarg → C
  assertEqual(labels[0], ["E", "analysis"], "intro amb l'acord de l'anàlisi")
  assert(labels.some(([l, s]) => l === "Am" && s === "content"), "Am del content")
  assert(labels.some(([l, s]) => l === "C" && s === "analysis"), "final amb l'acord de l'anàlisi")
  assertEqual(tl.chords[tl.chords.length - 1].label, null, "s'acaba amb silenci")
  assertEqual(tl.firstChordT, 0, "comença a l'intro")

  // Aturada: 2 s sense acords a l'anàlisi enmig d'un acord escrit
  const stop = analysis({
    chords: [[0, 4000, "Am"], [6000, 12000, "Am"]],
    words: sung("una dues tres quatre cinc sis set vuit", 0),
  })
  const tl2 = buildTimeline(stop, syncAnalysis(stop, "<ch>Am</ch>una dues tres quatre cinc sis set vuit"))
  assertEqual(
    tl2.chords.map((c) => [c.label, c.t]),
    [["Am", 0], [null, 4000], ["Am", 6000], [null, 12000]],
    "s'apaga a l'aturada i hi torna",
  )
})

test("Cronologia: consultes", () => {
  const items = [{ t: 0 }, { t: 100 }, { t: 200 }]
  assertEqual(indexAt(items, -5), -1, "abans de tot")
  assertEqual(indexAt(items, 150), 1, "entremig")
  assertEqual(indexAt(items, 999), 2, "després de tot")
  const an = analysis({ chords: CHORDS, words: WORDS, durationMs: 24000 })
  const tl = buildTimeline(an, syncAnalysis(an, "<ch>Am</ch>Hola com <ch>F</ch>estàs avui\n<ch>G</ch>molt bé gràcies"))
  assertEqual(occurrenceAt(tl.occurrences, 6500), 0, "primera línia")
  assertEqual(occurrenceAt(tl.occurrences, 10500), 1, "segona línia")
  assertEqual(occurrenceAt(tl.occurrences, 1000), -1, "a l'intro no se'n canta cap")
  assertEqual(barStartAt(tl, 7300), 6000, "inici del compàs")
})

test("Arranjament: atacs per compàs segons l'estil", () => {
  const an = analysis({ chords: [[0, 20000, "G"]], durationMs: 8000 })
  const tl = buildTimeline(an, syncAnalysis(an, ""))
  const bar = (style: Parameters<typeof arrange>[1]["style"]) =>
    arrange(tl, { style, pitchShift: 0 }).filter((e) => e.track === "guitar" && e.t >= 2000 - 10 && e.t < 4000 - 10)
  // Pop "D! . D U . U D U": 5 rasguejos, 2 de 6 cordes avall (G té 6 cordes) i 3 de 4 amunt... i 1 avall de 6
  const pop = bar("pop")
  assertEqual(pop.length, 6 * 3 + 4 * 3, "pop: 3 rasguejos avall de 6 cordes i 3 amunt de 4")
  const balada = bar("balada")
  assertEqual(balada.length, 8, "balada: 8 notes (p i m a p a m i)")
  assert(balada.every((e) => !e.bright), "balada: amb els dits")
  const vals = arrange(tl, { style: "vals", pitchShift: 0 }).filter((e) => e.track === "bass")
  assert(vals.length > 0, "vals: baix a cada compàs")
  const lliure = arrange(tl, { style: "lliure", pitchShift: 0 }).filter((e) => e.track === "guitar")
  assertEqual(lliure.length, 6, "lliure: un sol rasgueig")
  // Clic a cada temps, el fort al primer
  const clicks = arrange(tl, { style: "pop", pitchShift: 0 }).filter((e) => e.track === "click")
  assertEqual(clicks.length, tl.beats.length, "un clic per temps")
  assertEqual(clicks[0].sound, "clickStrong", "temps fort")
})

test("Arranjament: transposició, canvis fora de franja i cordes", () => {
  const an = analysis({ chords: [[0, 2300, "C"], [2300, 8000, "G"]], durationMs: 8000 })
  const tl = buildTimeline(an, syncAnalysis(an, ""))
  // Balada: franges de corxera (250 ms); el canvi a 2300 cau entre 2250 i 2500 → 2250
  const ev = arrange(tl, { style: "balada", pitchShift: 0 }).filter((e) => e.track === "guitar")
  const at = ev.filter((e) => Math.abs(e.t - 2250) < 10)
  assertEqual(at.length, 1, "al canvi s'hi toca el farciment (polze)")
  assertEqual(at[0].midi, 43, "baix del G (sisena al 3)")
  // Les notes del C que sonaven s'apaguen al canvi
  const before = ev.filter((e) => e.t < 2240)
  assert(before.every((e) => e.t + e.dur <= 2250 + 30), "el canvi d'acord apaga les cordes")
  // Transposició: +2 → D (el baix del D és la quarta a l'aire, 50)
  const up = arrange(tl, { style: "balada", pitchShift: 2 }).filter((e) => e.track === "guitar")
  assertEqual(up[0].midi, 50, "+2: el primer baix és el del D")
  // Groove: accent zero a totes les franges menys la primera → intensitats més baixes
  const flat = arrange(tl, { style: "pop", pitchShift: 0 })
  const shaped = arrange(tl, {
    style: "pop",
    pitchShift: 0,
    groove: { slots_per_beat: 4, low: [], mid: [1, ...Array(15).fill(0)], high: [] },
  })
  const sum = (es: typeof flat) => es.filter((e) => e.track === "guitar").reduce((n, e) => n + e.vel, 0)
  assert(sum(shaped) < sum(flat), "l'empremta de groove baixa les franges sense accent")
})

// ── Resultat final ─────────────────────────────────────────────────────────────

console.log("")
if (failed) {
  console.error("Hi ha tests fallits. Revisa els errors de dalt.")
  process.exit(1)
} else {
  console.log("✓ Tots els tests han passat")
}
