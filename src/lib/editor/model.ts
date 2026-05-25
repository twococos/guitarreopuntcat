/**
 * src/lib/editor/model.ts — Model intern de l'editor WYSIWYG de cançons.
 * Defineix els tipus Doc/Block/Inline i les funcions pures parse/serialize.
 * Propietat fonamental: serialize(parse(x)) === x per a qualsevol x vàlid de la BD.
 */

// ── Tipus ─────────────────────────────────────────────────────────────────────

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "chord"; chord: string }

export type Block =
  | { kind: "section"; name: string }
  | { kind: "lyric"; spans: Inline[] }
  | { kind: "empty" } // línia buida (preserva espaiat visual de l'usuari)

export interface Doc {
  blocks: Block[]
}

// ── Regex auxiliars ───────────────────────────────────────────────────────────

// Detecta una línia que és exclusivament <sec>...</sec> (amb possibles espais exteriors)
const SEC_LINE_RE = /^\s*<sec>([^<]*)<\/sec>\s*$/

// Troba tots els tokens dins una línia de lletra: <ch>X</ch> o text entre acords
const LYRIC_TOKEN_RE = /<ch>([^<]*)<\/ch>|([^<]+)/g

// ── parse ─────────────────────────────────────────────────────────────────────

/**
 * Converteix el text cru de la BD (amb tags <sec> i <ch>) a un Doc.
 *
 * Regles:
 * - Línia buida → bloc empty
 * - Línia exactament <sec>X</sec> (opcionalment espais externs) → bloc section
 * - Resta → bloc lyric amb spans text/chord
 */
export function parse(raw: string): Doc {
  const lines = raw.split("\n")
  const blocks: Block[] = []

  for (const line of lines) {
    // Línia buida
    if (line === "") {
      blocks.push({ kind: "empty" })
      continue
    }

    // Secció: la línia sencera és <sec>...</sec> (sense altre contingut)
    const secMatch = SEC_LINE_RE.exec(line)
    if (secMatch !== null) {
      blocks.push({ kind: "section", name: secMatch[1] })
      continue
    }

    // Línia de lletra: extreu spans alternant text i chord
    const spans: Inline[] = []
    let match: RegExpExecArray | null

    // Reinicia lastIndex (important quan LYRIC_TOKEN_RE és global i es reutilitza)
    LYRIC_TOKEN_RE.lastIndex = 0

    while ((match = LYRIC_TOKEN_RE.exec(line)) !== null) {
      if (match[1] !== undefined) {
        // Grup 1: coincideix <ch>X</ch>
        spans.push({ kind: "chord", chord: match[1] })
      } else if (match[2] !== undefined) {
        // Grup 2: text literal entre acords
        spans.push({ kind: "text", text: match[2] })
      }
    }

    blocks.push({ kind: "lyric", spans })
  }

  return { blocks }
}

// ── serialize ─────────────────────────────────────────────────────────────────

/**
 * Converteix un Doc al text cru de la BD.
 * Invers exacte de parse: serialize(parse(x)) === x.
 */
export function serialize(doc: Doc): string {
  const lines: string[] = doc.blocks.map((block) => {
    switch (block.kind) {
      case "empty":
        return ""

      case "section":
        return `<sec>${block.name}</sec>`

      case "lyric":
        return block.spans
          .map((span) => {
            if (span.kind === "chord") {
              return `<ch>${span.chord}</ch>`
            }
            // span.kind === "text"
            return span.text
          })
          .join("")
    }
  })

  return lines.join("\n")
}
