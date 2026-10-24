/**
 * src/lib/chords/diagram.ts — Diagrames d'acords de guitarra.
 *
 * La posició és la mateixa que toca el reproductor (`fretsFor`, src/lib/player/voicings.ts).
 * D'aquí en surt la geometria (finestra de trasts, cejilla, cordes a l'aire i mudes) i un SVG
 * fet NOMÉS de `<path>`/`<rect>` plens: l'escriptor del PDF (pdf-client/writer/svg.ts) els
 * calca tal qual i no sap pintar `<text>` ni traços amb gruix fiable. El nom de l'acord i el
 * trast de la finestra («5fr») van en HTML, fora de l'SVG.
 *
 * Pur: el fan servir la web (popover dels acords) i el PDF (glossari i símbols per cançó).
 */

import { fretsFor, parseChord, type Quality } from "@/lib/player/voicings"
import { getT } from "@/lib/i18n"

export interface ChordDiagram {
  /** Trast per corda, de greu (0) a aguda (5); -1 = no sona, 0 = a l'aire. */
  frets: number[]
  /** Trast de la primera fila de la graella (1 = la cejuela es veu). */
  baseFret: number
  /** Files de la graella (4, o 5 si la posició és més oberta). */
  rows: number
  /** Cejilla: trast i cordes que cobreix (de greu a aguda), o null. */
  barre: { fret: number; from: number; to: number } | null
}

const MIN_ROWS = 4
const MAX_ROWS = 5

/** Etiquetes que semblen un sol acord (no «E→A», «Am-G» ni text lliure). */
const SINGLE_CHORD = /^[A-G][#b]?[A-Za-z0-9#b+°øΔ()]*(\/[A-G][#b]?)?$/

export function chordDiagram(label: string): ChordDiagram | null {
  const clean = label.trim()
  if (!SINGLE_CHORD.test(clean)) return null
  const frets = fretsFor(clean)
  if (!frets || frets.every((f) => f < 0)) return null
  const pressed = frets.filter((f) => f > 0)
  const min = pressed.length ? Math.min(...pressed) : 0
  const max = pressed.length ? Math.max(...pressed) : 0
  const baseFret = max <= MIN_ROWS ? 1 : min
  const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, max - baseFret + 1))

  // Cejilla: la corda més greu que sona és al trast més baix, n'hi ha almenys una altra
  // al mateix trast i cap corda a l'aire o muda entremig (així D, A o Em no en porten).
  let barre: ChordDiagram["barre"] = null
  const lowest = frets.findIndex((f) => f >= 0)
  if (min > 0 && frets[lowest] === min) {
    const at = frets.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0)
    if (at.length >= 2) {
      const from = at[0]
      const to = at[at.length - 1]
      if (frets.slice(from, to + 1).every((f) => f >= min)) barre = { fret: min, from, to }
    }
  }
  return { frets, baseFret, rows, barre }
}

/* ── SVG ─────────────────────────────────────────────────────── */

// Geometria en unitats del viewBox.
const MX = 7 // marge lateral fins a la sisena corda
const SP = 9 // separació entre cordes
const GRID_TOP = 11 // on comença la graella (a sobre, les X i les O)
const ROW_H = 11
/** Gruix per defecte de cordes i trasts (el PDF). La web en passa un que faci
 *  un nombre enter de píxels de pantalla (vegeu ChordHoverLayer). */
const LINE = 0.7
const NUT = 2.6 // gruix de la cejuela
const DOT_R = 3.5
const MARK_Y = 5 // centre de les X i les O
const MARK_R = 2.4

/** Amplada del viewBox. */
export const DIAGRAM_W = MX * 2 + SP * 5
const W = DIAGRAM_W

function heightFor(rows: number): number {
  return GRID_TOP + rows * ROW_H + 2
}

const n = (v: number) => Math.round(v * 1000) / 1000

function circle(cx: number, cy: number, r: number, sweep: 0 | 1 = 0): string {
  return (
    `M${n(cx - r)} ${n(cy)}` +
    `A${n(r)} ${n(r)} 0 1 ${sweep} ${n(cx + r)} ${n(cy)}` +
    `A${n(r)} ${n(r)} 0 1 ${sweep} ${n(cx - r)} ${n(cy)}Z`
  )
}

/** Anell: dos cercles en sentits contraris (el forat queda buit amb la regla nonzero). */
function ring(cx: number, cy: number, r: number, w: number): string {
  return circle(cx, cy, r, 0) + circle(cx, cy, r - w, 1)
}

/** Creu: dos rectangles girats 45°, com a polígons. */
function cross(cx: number, cy: number, h: number, w: number): string {
  const d = w / 2 / Math.SQRT2
  const bar = (sx: number) =>
    `M${n(cx - h + d)} ${n(cy - sx * (h + d))}` +
    `L${n(cx + h + d)} ${n(cy + sx * (h - d))}` +
    `L${n(cx + h - d)} ${n(cy + sx * (h + d))}` +
    `L${n(cx - h - d)} ${n(cy - sx * (h - d))}Z`
  return bar(1) + bar(-1)
}

/** Càpsula horitzontal (la cejilla). */
function capsule(x1: number, x2: number, cy: number, r: number): string {
  return (
    `M${n(x1)} ${n(cy - r)}H${n(x2)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x2)} ${n(cy + r)}` +
    `H${n(x1)}A${n(r)} ${n(r)} 0 0 1 ${n(x1)} ${n(cy - r)}Z`
  )
}

const stringX = (i: number) => MX + i * SP
const rowY = (row: number) => GRID_TOP + row * ROW_H + ROW_H / 2

/**
 * `crispLine`: només per a la pantalla a mida fixa (popover de la web). És el gruix
 * de cordes i trasts que fa un nombre enter de píxels; amb `crispEdges` surten totes
 * iguals. Sense, gruix del PDF i antialiàs normal: la prèvia del PDF va escalada
 * amb `transform` i `crispEdges` hi faria desaparèixer o engruixir línies.
 */
export function chordDiagramSvg(d: ChordDiagram, crispLine?: number): string {
  const line = crispLine ?? LINE
  const h = heightFor(d.rows)
  const gridW = SP * 5
  const gridH = d.rows * ROW_H
  const parts: string[] = []

  // Cejuela (gruixuda si la finestra comença al trast 1), trasts i cordes.
  const nutH = d.baseFret === 1 ? NUT : line
  parts.push(`<rect x="${n(MX - line / 2)}" y="${n(GRID_TOP - nutH + line / 2)}" width="${n(gridW + line)}" height="${n(nutH)}"/>`)
  for (let r = 1; r <= d.rows; r++) {
    parts.push(`<rect x="${n(MX - line / 2)}" y="${n(GRID_TOP + r * ROW_H - line / 2)}" width="${n(gridW + line)}" height="${n(line)}"/>`)
  }
  for (let i = 0; i < 6; i++) {
    parts.push(`<rect x="${n(stringX(i) - line / 2)}" y="${GRID_TOP}" width="${n(line)}" height="${gridH}"/>`)
  }

  // Punts, cejilla, X i O.
  const shapes: string[] = []
  if (d.barre) {
    const y = rowY(d.barre.fret - d.baseFret)
    shapes.push(capsule(stringX(d.barre.from), stringX(d.barre.to), y, DOT_R))
  }
  d.frets.forEach((f, i) => {
    const x = stringX(i)
    if (f < 0) shapes.push(cross(x, MARK_Y, MARK_R, LINE * 1.2))
    else if (f === 0) shapes.push(ring(x, MARK_Y, MARK_R, LINE * 1.1))
    else if (!(d.barre && f === d.barre.fret && i >= d.barre.from && i <= d.barre.to)) {
      shapes.push(circle(x, rowY(f - d.baseFret), DOT_R))
    }
  })
  parts.push(`<path d="${shapes.join("")}"/>`)

  return (
    `<svg class="chord-svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" ` +
    `xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">` +
    (crispLine !== undefined
      ? `<g shape-rendering="crispEdges">${parts.slice(0, -1).join("")}</g>${parts[parts.length - 1]}`
      : parts.join("")) +
    `</svg>`
  )
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Diagrama complet en HTML: nom a sobre, graella i, si la finestra no comença al trast 1,
 * el número del trast al costat de la primera fila. `label` és l'acord en notació anglesa
 * (el que s'analitza); `displayName`, com s'ha de mostrar (bemolls, DoReMi…).
 * `crispLine`: vegeu `chordDiagramSvg` (només el popover de la web).
 * Null si l'acord no s'entén.
 */
export function chordDiagramHtml(label: string, displayName: string = label, crispLine?: number): string | null {
  const d = chordDiagram(label)
  if (!d) return null
  const h = heightFor(d.rows)
  const fr =
    d.baseFret > 1
      ? `<span class="chord-fr" style="top: ${n(((GRID_TOP + ROW_H / 2) / h) * 100)}%">${escHtml(getT().common.chords.trast(d.baseFret))}</span>`
      : ""
  return (
    `<figure class="chord-diagram">` +
    `<figcaption class="chord-name">${escHtml(displayName)}</figcaption>` +
    `<div class="chord-grid">${chordDiagramSvg(d, crispLine)}${fr}</div>` +
    `</figure>`
  )
}

/* ── Llistes d'acords ───────────────────────────────────────── */

/** Acords únics d'un content (`<ch>X</ch>`), en ordre d'aparició. */
export function collectChords(content: string): string[] {
  const seen = new Set<string>()
  for (const m of content.matchAll(/<ch>([^<]+)<\/ch>/g)) {
    const c = m[1].trim()
    if (c) seen.add(c)
  }
  return [...seen]
}

const QUALITY_ORDER: Quality[] = [
  "maj", "m", "7", "m7", "maj7", "6", "m6", "sus2", "sus4", "7sus4", "add9",
  "dim", "dim7", "m7b5", "aug", "5",
]

/** Ordena per arrel (C → B), qualitat i baix. Els que no s'entenen van al final. */
export function sortChords(labels: string[]): string[] {
  const key = (l: string): [number, number, number, string] => {
    const p = parseChord(l)
    if (!p) return [99, 99, 99, l]
    return [p.root, QUALITY_ORDER.indexOf(p.quality), p.bass === null ? -1 : p.bass, l]
  }
  return [...labels].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number)
    return ka[3].localeCompare(kb[3])
  })
}
