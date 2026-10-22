/**
 * src/lib/player/styles.ts — Catàleg d'estils rítmics de l'acompanyament.
 *
 * Els IDs són contracte amb el transcriptor (camp `rhythm.style` de l'anàlisi, vegeu
 * docs/api_worker.md) i amb `songs.rhythm`: no se'n reanomena cap.
 *
 * Un estil és un patró per a un cicle de `pulses` pulsacions, cadascuna partida en `sub`
 * franges. La pulsació és el temps que se sent: la negra en 2/4, 3/4 i 4/4, i la negra amb
 * punt en 6/8 (vegeu timeline.ts). El patró es reparteix sobre la graella real de la cançó,
 * de manera que segueix les acceleracions; a cada compàs es torna a començar.
 *
 * Fitxes de guitarra (una per franja, separades per espais):
 *   D d   rasgueig avall (fort / suau, només cordes agudes)
 *   U u   rasgueig amunt (4 / 3 cordes agudes)
 *   P p   rasgueig de les 3 cordes greus (rock; fort / suau)
 *   S s   rasgueig curt i apagat, avall / amunt (skank)
 *   X     cop apagat (chuck)
 *   B A   polze: baix de l'acord / baix alternat
 *   1 2 3 dits i, m, a: tercera, segona i primera de les cordes agudes de la posició
 *   T     les tres cordes agudes alhora
 *   C     polze + les tres agudes (pinça)
 *   .     res (el que sona continua)
 *   _     apaga totes les cordes
 * Un `!` al final accentua la fitxa.
 *
 * Baix: R arrel · F quinta · O octava · . res · _ apaga.
 * Percussió: k bombo · s caixa/caixó · h shaker · H shaker accentuat · . res.
 */

export const STYLE_IDS = [
  "pop",
  "balada",
  "rock",
  "folk",
  "rumba",
  "havanera",
  "marxa",
  "reggae",
  "bossa",
  "swing",
  "vals",
  "vals-arpegi",
  "compost-arpegi",
  "compost-rasgueig",
  "lliure",
] as const

export type StyleId = (typeof STYLE_IDS)[number]

export function isStyleId(x: unknown): x is StyleId {
  return typeof x === "string" && (STYLE_IDS as readonly string[]).includes(x)
}

export interface StyleDef {
  id: StyleId
  /** `compound`: pensat per a 6/8 (pulsació partida en tres). `free`: sense pulsació. */
  feel: "simple" | "compound" | "free"
  /** Pulsacions del cicle del patró. */
  pulses: number
  /** Franges per pulsació. */
  sub: number
  guitar: string
  bass: string
  perc: string
  /** Fitxa que es toca en un canvi d'acord que cau en una franja buida. */
  fill: string
  /** Tempo habitual, en pulsacions per minut (per a l'estil per defecte). */
  bpm: [number, number]
  /** Pulsacions per compàs amb què l'estil és natural. */
  meters: number[]
}

export const STYLES: Record<StyleId, StyleDef> = {
  pop: {
    id: "pop", feel: "simple", pulses: 4, sub: 2,
    guitar: "D! . D U . U D U",
    bass:   "R . . . F . . .",
    perc:   "k h s h k h s h",
    fill: "D", bpm: [80, 140], meters: [4],
  },
  balada: {
    id: "balada", feel: "simple", pulses: 4, sub: 2,
    guitar: "B! 1 2 3 A 3 2 1",
    bass:   "R . . . . . . .",
    perc:   ". . . . . . . .",
    fill: "B", bpm: [50, 95], meters: [4],
  },
  rock: {
    id: "rock", feel: "simple", pulses: 4, sub: 2,
    guitar: "P! p P p P! p P p",
    bass:   "R R R R R R R R",
    perc:   "k h s h k k s h",
    fill: "P", bpm: [100, 190], meters: [4],
  },
  folk: {
    id: "folk", feel: "simple", pulses: 4, sub: 2,
    guitar: "B! . d u A . d u",
    bass:   "R . . . F . . .",
    perc:   "k . s . k . s .",
    fill: "D", bpm: [80, 150], meters: [4, 2],
  },
  rumba: {
    id: "rumba", feel: "simple", pulses: 4, sub: 4,
    guitar: "D! . d U X . d U D . d U X! . d U",
    bass:   "R . . . . . F . R . . . . . F .",
    perc:   "k . h . s . h k k . h . s . h .",
    fill: "D", bpm: [90, 150], meters: [4],
  },
  havanera: {
    id: "havanera", feel: "simple", pulses: 2, sub: 4,
    guitar: "B! . . T T . T .",
    bass:   "R . . F R . . .",
    perc:   "h . . h h . h .",
    fill: "B", bpm: [55, 100], meters: [2, 4],
  },
  marxa: {
    id: "marxa", feel: "simple", pulses: 4, sub: 2,
    guitar: "B! . S . A . S .",
    bass:   "R . . . F . . .",
    perc:   "k . s . k . s .",
    fill: "S", bpm: [95, 150], meters: [2, 4],
  },
  reggae: {
    id: "reggae", feel: "simple", pulses: 4, sub: 2,
    guitar: ". S . S . S! . S",
    bass:   "R . . F . . R .",
    perc:   "h . h . k . h .",
    fill: "S", bpm: [60, 180], meters: [4],
  },
  bossa: {
    id: "bossa", feel: "simple", pulses: 4, sub: 2,
    guitar: "C! . . T A T . .",
    bass:   "R . . . F . . .",
    perc:   "h h h h h h h h",
    fill: "C", bpm: [100, 160], meters: [4],
  },
  swing: {
    id: "swing", feel: "simple", pulses: 4, sub: 3,
    guitar: "D! . u D . u D . u D . u",
    bass:   "R . . F . . O . . F . .",
    perc:   "k . h s . h k . h s . h",
    fill: "D", bpm: [90, 200], meters: [4],
  },
  vals: {
    id: "vals", feel: "simple", pulses: 3, sub: 2,
    guitar: "B! . d . d .",
    bass:   "R . . . . .",
    perc:   ". . h . h .",
    fill: "B", bpm: [90, 210], meters: [3],
  },
  "vals-arpegi": {
    id: "vals-arpegi", feel: "simple", pulses: 3, sub: 2,
    guitar: "B! 1 2 3 2 1",
    bass:   "R . . . . .",
    perc:   ". . . . . .",
    fill: "B", bpm: [60, 140], meters: [3],
  },
  "compost-arpegi": {
    id: "compost-arpegi", feel: "compound", pulses: 2, sub: 3,
    guitar: "B! 1 2 3 2 1",
    bass:   "R . . . . .",
    perc:   ". . . . . .",
    fill: "B", bpm: [35, 75], meters: [2],
  },
  "compost-rasgueig": {
    id: "compost-rasgueig", feel: "compound", pulses: 2, sub: 3,
    guitar: "D! . u D u d",
    bass:   "R . . F . .",
    perc:   "k . . s . .",
    fill: "D", bpm: [50, 110], meters: [2, 4],
  },
  lliure: {
    id: "lliure", feel: "free", pulses: 1, sub: 1,
    guitar: "D",
    bass:   "R",
    perc:   ".",
    fill: "D", bpm: [0, 400], meters: [1, 2, 3, 4],
  },
}

export interface Token {
  sym: string
  accent: boolean
}

/** "D! . u" → fitxes. */
export function tokens(pattern: string): Token[] {
  return pattern
    .trim()
    .split(/\s+/)
    .map((t) => ({ sym: t.replace(/!$/, ""), accent: t.endsWith("!") }))
}

/**
 * Estil per defecte quan ni l'admin ni el transcriptor n'han triat cap: pel compàs i el tempo.
 * `pulsesPerBar` i `bpm` són de la pulsació (en 6/8, la negra amb punt).
 */
export function defaultStyle(pulsesPerBar: number, compound: boolean, bpm: number | null): StyleId {
  const tempo = bpm ?? 100
  if (compound) return tempo < 60 ? "compost-arpegi" : "compost-rasgueig"
  if (pulsesPerBar === 3) return tempo < 100 ? "vals-arpegi" : "vals"
  if (tempo < 85) return "balada"
  return "pop"
}

/**
 * Estil efectiu: el fixat per l'admin (`songs.rhythm`), el detectat pel transcriptor
 * o, si no n'hi ha cap, el per defecte.
 */
export function effectiveStyle(
  fixed: string | null | undefined,
  detected: string | null | undefined,
  fallback: StyleId,
): { id: StyleId; source: "fixed" | "detected" | "default" } {
  if (isStyleId(fixed)) return { id: fixed, source: "fixed" }
  if (isStyleId(detected)) return { id: detected, source: "detected" }
  return { id: fallback, source: "default" }
}
