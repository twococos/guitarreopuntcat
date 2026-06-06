/**
 * src/lib/editor/search.ts — Cerca i reemplaç dins el model de l'editor.
 *
 * Opera sobre el Doc intern (no el DOM) perquè acords i seccions són atòmics.
 * La cerca abasta tres tipus de camp: la lletra (spans text), els acords
 * (spans chord) i els noms de secció. Tot és case-insensitive i literal (no
 * regex) — coherent amb una barra de cerca d'editor de text.
 */

import type { Doc, Inline, Block } from "./model"

/** Una coincidència localitzada dins el Doc. */
export interface SearchMatch {
  blockIdx: number
  kind: "text" | "chord" | "section"
  /**
   * Índex de l'span dins block.spans (per a kind text/chord). Per a section és
   * indiferent (la secció és tot el bloc) i val -1.
   */
  spanIdx: number
  /** Offset inicial (inclusiu) dins el text del camp. */
  start: number
  /** Offset final (exclusiu) dins el text del camp. */
  end: number
}

/**
 * Recorre el Doc i retorna totes les coincidències de `query`, en ordre de
 * lectura (per bloc, i dins el bloc d'esquerra a dreta). Query buida → [].
 */
export function findMatches(doc: Doc, query: string): SearchMatch[] {
  if (query === "") return []
  const needle = query.toLowerCase()
  const out: SearchMatch[] = []

  doc.blocks.forEach((block, blockIdx) => {
    if (block.kind === "section") {
      pushOccurrences(block.name, needle, (start, end) => {
        out.push({ blockIdx, kind: "section", spanIdx: -1, start, end })
      })
      return
    }
    if (block.kind !== "lyric") return
    block.spans.forEach((span, spanIdx) => {
      const value = span.kind === "text" ? span.text : span.chord
      const kind = span.kind === "text" ? "text" : "chord"
      pushOccurrences(value, needle, (start, end) => {
        out.push({ blockIdx, kind, spanIdx, start, end })
      })
    })
  })

  return out
}

/** Crida `emit(start, end)` per a cada ocurrència de `needle` (ja en minúscules) dins `haystack`. */
function pushOccurrences(
  haystack: string,
  needle: string,
  emit: (start: number, end: number) => void,
): void {
  if (needle === "") return
  const hay = haystack.toLowerCase()
  let from = 0
  for (;;) {
    const idx = hay.indexOf(needle, from)
    if (idx === -1) break
    emit(idx, idx + needle.length)
    from = idx + needle.length // sense solapaments
  }
}

/**
 * Reemplaça una única coincidència pel text `replacement` i retorna un nou Doc.
 * Per a `chord`/`section` el replacement substitueix el tros coincident del
 * valor (no tot el camp), preservant la resta del nom/acord.
 */
export function replaceMatch(
  doc: Doc,
  match: SearchMatch,
  replacement: string,
): Doc {
  const blocks = doc.blocks.slice()
  const block = blocks[match.blockIdx]
  if (!block) return doc

  if (match.kind === "section") {
    if (block.kind !== "section") return doc
    blocks[match.blockIdx] = {
      kind: "section",
      name: spliceStr(block.name, match.start, match.end, replacement),
    }
    return { blocks }
  }

  if (block.kind !== "lyric") return doc
  const span = block.spans[match.spanIdx]
  if (!span) return doc

  const newSpans = block.spans.slice()
  if (span.kind === "text" && match.kind === "text") {
    newSpans[match.spanIdx] = {
      kind: "text",
      text: spliceStr(span.text, match.start, match.end, replacement),
    }
  } else if (span.kind === "chord" && match.kind === "chord") {
    newSpans[match.spanIdx] = {
      kind: "chord",
      chord: spliceStr(span.chord, match.start, match.end, replacement),
    }
  } else {
    return doc
  }

  blocks[match.blockIdx] = mergeText({ kind: "lyric", spans: newSpans })
  return { blocks }
}

/**
 * Reemplaça TOTES les coincidències de `query` per `replacement` i retorna un
 * nou Doc. Recalcula les coincidències internament i aplica de dreta a esquerra
 * dins cada camp perquè els offsets no es desplacin.
 */
export function replaceAll(doc: Doc, query: string, replacement: string): Doc {
  if (query === "") return doc
  const matches = findMatches(doc, query)
  if (matches.length === 0) return doc

  // Agrupem per (blockIdx, spanIdx, kind) i apliquem de dreta a esquerra.
  const sorted = [...matches].sort((a, b) => {
    if (a.blockIdx !== b.blockIdx) return b.blockIdx - a.blockIdx
    if (a.spanIdx !== b.spanIdx) return b.spanIdx - a.spanIdx
    return b.start - a.start
  })

  let result = doc
  for (const m of sorted) {
    result = replaceMatch(result, m, replacement)
  }
  return result
}

/** Substitueix [start, end) de `s` per `insert`. */
function spliceStr(s: string, start: number, end: number, insert: string): string {
  return s.slice(0, start) + insert + s.slice(end)
}

/** Fusiona spans de text adjacents d'un bloc lyric (canònic). */
function mergeText(block: Extract<Block, { kind: "lyric" }>): Block {
  const out: Inline[] = []
  for (const span of block.spans) {
    const last = out[out.length - 1]
    if (span.kind === "text" && last && last.kind === "text") {
      out[out.length - 1] = { kind: "text", text: last.text + span.text }
    } else {
      out.push(span)
    }
  }
  return { kind: "lyric", spans: out }
}
