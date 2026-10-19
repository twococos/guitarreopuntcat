/**
 * scripts/validate-sync.ts — Validació de syncAnalysis() amb les cançons del benchmark del transcriptor.
 *
 * Entrada: un JSONL amb {id, title, capo, content, analysis (format compacte v2)} per línia, generat
 * al repo transcriptor a partir de work/bench (vegeu docs/sync.md d'aquell repo).
 *
 * Per a cada cançó: sincronització del content tal com és, i de 6 mutacions del content que
 * simulen edicions habituals. Mesura que les parts no tocades no es moguin i que la qualitat
 * reaccioni com cal.
 *
 * Execució: npx tsx scripts/validate-sync.ts <sync_dataset.jsonl> [--out informe.md]
 */

import { readFileSync, writeFileSync } from "node:fs"
import { parse, serialize, type Block, type Inline } from "../src/lib/editor/model"
import { analysisCompactSchema, type AnalysisCompact } from "../src/lib/schemas/transcriber"
import { syncAnalysis, type SyncResult } from "../src/lib/transcriber/sync"
import { transposeContent } from "../src/lib/transpose"

interface Song {
  id: number
  title: string
  capo: number
  content: string
  analysis: AnalysisCompact
}

// ── Utilitats ─────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed * 2654435761 % 4294967296
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)} %` : "—")
const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—")

function lyricText(b: Block): string {
  return b.kind === "lyric" ? b.spans.map((s) => (s.kind === "text" ? s.text : "")).join("") : ""
}

function hasWords(b: Block): boolean {
  return /\p{L}/u.test(lyricText(b))
}

/**
 * Temps de les paraules per línia. Clau "bloc#repetició" si la mutació no canvia els blocs, o
 * "text de la línia#repetició" si n'afegeix o en treu.
 */
function wordsByLine(content: string, r: SyncResult, byText: boolean): Map<string, number[]> {
  const blocks = parse(content.replace(/\r/g, "")).blocks
  const out = new Map<string, number[]>()
  for (const o of r.occurrences) {
    const key = byText ? lyricText(blocks[o.block]).trim() : String(o.block)
    if (o.words.length) out.set(`${key}#${o.rep}`, o.words.map((w) => w[0]))
  }
  return out
}

/** Temps dels acords per clau "text de la línia#repetició#ordre". */
function chordsByLine(content: string, r: SyncResult): Map<string, number> {
  const blocks = parse(content.replace(/\r/g, "")).blocks
  const out = new Map<string, number>()
  for (const o of r.occurrences) {
    const text = lyricText(blocks[o.block]).trim()
    o.chords.forEach((c, i) => out.set(`${text}#${o.rep}#${i}`, c.t))
  }
  return out
}

/** Fracció de paraules comunes que no s'han mogut més de 50 ms. */
function stableWords(a: Map<string, number[]>, b: Map<string, number[]>): number {
  let total = 0
  let same = 0
  for (const [k, ta] of a) {
    const tb = b.get(k)
    if (!tb || tb.length !== ta.length) continue
    ta.forEach((t, i) => {
      total++
      if (Math.abs(t - tb[i]) <= 50) same++
    })
  }
  return total ? same / total : NaN
}

// ── Mutacions ─────────────────────────────────────────────────────────────────

type Mutation = (content: string, rand: () => number) => { content: string; info?: unknown } | null

/** Línia amb lletra → (text, acords amb posició) i a la inversa. */
function explode(spans: Inline[]): { text: string; chords: { pos: number; chord: string }[] } {
  let text = ""
  const chords: { pos: number; chord: string }[] = []
  for (const s of spans) {
    if (s.kind === "chord") chords.push({ pos: text.length, chord: s.chord })
    else text += s.text
  }
  return { text, chords }
}

function implode(text: string, chords: { pos: number; chord: string }[]): Inline[] {
  const spans: Inline[] = []
  let last = 0
  for (const c of [...chords].sort((a, b) => a.pos - b.pos)) {
    if (c.pos > last) spans.push({ kind: "text", text: text.slice(last, c.pos) })
    spans.push({ kind: "chord", chord: c.chord })
    last = Math.max(last, c.pos)
  }
  if (last < text.length) spans.push({ kind: "text", text: text.slice(last) })
  return spans
}

const MUTATIONS: Record<string, { desc: string; byText?: boolean; fn: Mutation }> = {
  "mou-acords": {
    desc: "un 30 % dels acords de les línies amb lletra, a l'inici de la paraula següent",
    fn: (content, rand) => {
      const doc = parse(content)
      let moved = 0
      for (const b of doc.blocks) {
        if (b.kind !== "lyric" || !hasWords(b)) continue
        const { text, chords } = explode(b.spans)
        for (const c of chords) {
          if (rand() >= 0.3) continue
          const m = /\s+\S/.exec(text.slice(c.pos))
          if (!m) continue
          c.pos += m.index + m[0].length - 1
          moved++
        }
        b.spans = implode(text, chords)
      }
      return moved ? { content: serialize(doc), info: moved } : null
    },
  },
  "treu-linia": {
    desc: "s'esborra una línia amb lletra a l'atzar",
    byText: true,
    fn: (content, rand) => {
      const doc = parse(content)
      const idx = doc.blocks.map((b, i) => (hasWords(b) ? i : -1)).filter((i) => i >= 0)
      if (idx.length < 4) return null
      doc.blocks.splice(idx[Math.floor(rand() * idx.length)], 1)
      return { content: serialize(doc) }
    },
  },
  "afegeix-linia": {
    desc: "s'afegeix una línia inventada (que no es canta) enmig de la cançó",
    byText: true,
    fn: (content, rand) => {
      const doc = parse(content)
      const idx = doc.blocks.map((b, i) => (hasWords(b) ? i : -1)).filter((i) => i >= 0)
      if (idx.length < 2) return null
      const at = idx[Math.floor(rand() * idx.length)] + 1
      doc.blocks.splice(at, 0, {
        kind: "lyric",
        spans: [{ kind: "text", text: "Pingüins taronja dibuixen hexàgons sobre plàtans" }],
      })
      return { content: serialize(doc), info: at }
    },
  },
  "faltes": {
    desc: "sense accents ni majúscules, i un 10 % de paraules amb l'última lletra canviada",
    fn: (content, rand) => {
      const doc = parse(content)
      for (const b of doc.blocks) {
        if (b.kind !== "lyric") continue
        for (const s of b.spans) {
          if (s.kind !== "text") continue
          s.text = s.text
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
            .replace(/\p{L}{4,}/gu, (w) => (rand() < 0.1 ? w.slice(0, -1) + "x" : w))
        }
      }
      return { content: serialize(doc) }
    },
  },
  "transport": {
    desc: "tota la cançó transportada +2 semitons",
    fn: (content) => ({ content: transposeContent(content, 2) }),
  },
  "treu-seccions": {
    desc: "s'esborren totes les <sec>",
    byText: true,
    fn: (content) => {
      const doc = parse(content)
      doc.blocks = doc.blocks.filter((b) => b.kind !== "section")
      return { content: serialize(doc) }
    },
  },
}

// ── Execució ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith("--"))
const outIdx = args.indexOf("--out")
const outPath = outIdx >= 0 ? args[outIdx + 1] : null
if (!input) {
  console.error("Ús: npx tsx scripts/validate-sync.ts <sync_dataset.jsonl> [--out informe.md]")
  process.exit(1)
}

const songs: Song[] = readFileSync(input, "utf-8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    const s = JSON.parse(l)
    return { ...s, analysis: analysisCompactSchema.parse(s.analysis) }
  })

interface Row {
  id: number
  title: string
  source: string
  coverage: number | null
  words: number | null
  chords: number | null
  ok: boolean
  transpose: number
  unsung: number
  missing: number
  ms: number
}

const rows: Row[] = []
const mutStats: Record<string, { n: number; stable: number[]; dWords: number[]; dChords: number[]; extra: number[] }> = {}
for (const k of Object.keys(MUTATIONS)) mutStats[k] = { n: 0, stable: [], dWords: [], dChords: [], extra: [] }

for (const song of songs) {
  const t0 = performance.now()
  const base = syncAnalysis(song.analysis, song.content, song.capo)
  const ms = performance.now() - t0
  rows.push({
    id: song.id,
    title: song.title,
    source: song.analysis.lyrics_source,
    coverage: base.quality.coverage,
    words: base.quality.words,
    chords: base.quality.chords,
    ok: base.quality.ok,
    transpose: base.transpose,
    unsung: base.report.unsungLines.length,
    missing: base.report.missingSpans.length,
    ms,
  })
  if (!base.quality.ok) continue

  const baseWords = { text: wordsByLine(song.content, base, true), block: wordsByLine(song.content, base, false) }
  const baseChords = chordsByLine(song.content, base)
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const mut = m.fn(song.content, rng(song.id * 31 + name.length))
    if (!mut) continue
    const r = syncAnalysis(song.analysis, mut.content, song.capo)
    const st = mutStats[name]
    st.n++
    st.stable.push(stableWords(m.byText ? baseWords.text : baseWords.block, wordsByLine(mut.content, r, !!m.byText)))
    st.dWords.push((r.quality.words ?? 0) - (base.quality.words ?? 0))
    st.dChords.push((r.quality.chords ?? 0) - (base.quality.chords ?? 0))
    if (name === "mou-acords") {
      // Acords moguts: quants tornen al mateix temps que abans (±150 ms)
      const after = chordsByLine(mut.content, r)
      let same = 0
      let total = 0
      for (const [k, t] of baseChords) {
        const t2 = after.get(k)
        if (t2 === undefined) continue
        total++
        if (Math.abs(t2 - t) <= 150) same++
      }
      st.extra.push(total ? same / total : NaN)
    } else if (name === "afegeix-linia") {
      const at = mut.info as number
      st.extra.push(r.report.unsungLines.some((u) => u.block === at) ? 1 : 0)
    } else if (name === "transport") {
      // Content +2 → el desplaçament content → àudio baixa 2
      st.extra.push((((r.transpose - base.transpose + 2) % 12) + 12) % 12 === 0 ? 1 : 0)
    }
  }
}

// ── Informe ───────────────────────────────────────────────────────────────────

const ok = rows.filter((r) => r.ok)
const valid = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null && !Number.isNaN(x as number))
const cov = valid(rows.map((r) => r.coverage))
const wq = valid(rows.map((r) => r.words))
const cq = valid(rows.map((r) => r.chords))
const msAll = rows.map((r) => r.ms)

const lines: string[] = []
lines.push(`## Resultats (${new Date().toISOString().slice(0, 10)})`, "")
lines.push(`Cançons: ${rows.length}. Amb sincronització vàlida (\`ok\`): ${ok.length} (${pct(ok.length / rows.length)}).`, "")
lines.push("| Mesura | Mediana | P10 | P90 |", "|---|---|---|---|")
lines.push(`| Cobertura (lletra que es canta) | ${num(quantile(cov, 0.5))} | ${num(quantile(cov, 0.1))} | ${num(quantile(cov, 0.9))} |`)
lines.push(`| Paraules sentides (de les cantades) | ${num(quantile(wq, 0.5))} | ${num(quantile(wq, 0.1))} | ${num(quantile(wq, 0.9))} |`)
lines.push(`| Qualitat d'acords | ${num(quantile(cq, 0.5))} | ${num(quantile(cq, 0.1))} | ${num(quantile(cq, 0.9))} |`)
lines.push(`| Temps de càlcul (ms) | ${num(quantile(msAll, 0.5), 0)} | ${num(quantile(msAll, 0.1), 0)} | ${num(quantile(msAll, 0.9), 0)} |`)
lines.push("")
lines.push("### Robustesa davant d'edicions del content", "")
lines.push("Sobre les cançons amb `ok`. *Paraules estables*: paraules de les línies no tocades que no s'han mogut més de 50 ms.", "")
lines.push("| Mutació | Què fa | Cançons | Paraules estables (mediana / P10) | Δ qualitat paraules | Δ qualitat acords | Específic |")
lines.push("|---|---|---|---|---|---|---|")
for (const [name, m] of Object.entries(MUTATIONS)) {
  const st = mutStats[name]
  const stable = st.stable.filter((x) => !Number.isNaN(x))
  const extraLabel =
    name === "mou-acords" ? `acords al mateix temps que abans: ${pct(quantile(st.extra, 0.5))} (mediana)`
      : name === "afegeix-linia" ? `línia detectada com a no cantada: ${pct(st.extra.reduce((a, b) => a + b, 0) / Math.max(st.extra.length, 1))}`
        : name === "transport" ? `transport detectat: ${pct(st.extra.reduce((a, b) => a + b, 0) / Math.max(st.extra.length, 1))}`
          : ""
  lines.push(
    `| ${name} | ${m.desc} | ${st.n} | ${pct(quantile(stable, 0.5))} / ${pct(quantile(stable, 0.1))} | ` +
      `${num(quantile(st.dWords, 0.5), 3)} | ${num(quantile(st.dChords, 0.5), 3)} | ${extraLabel} |`,
  )
}
lines.push("")
lines.push("### Cançons sense sincronització vàlida", "")
lines.push("| id | Títol | Lletra | Cobertura | Paraules | Acords | Línies no cantades | Trams que falten |", "|---|---|---|---|---|---|---|---|")
for (const r of rows.filter((r) => !r.ok).sort((a, b) => (a.coverage ?? 0) - (b.coverage ?? 0))) {
  lines.push(`| ${r.id} | ${r.title} | ${r.source} | ${num(r.coverage ?? NaN)} | ${num(r.words ?? NaN)} | ${num(r.chords ?? NaN)} | ${r.unsung} | ${r.missing} |`)
}

const report = lines.join("\n") + "\n"
if (outPath) writeFileSync(outPath, report, "utf-8")
console.log(report)
