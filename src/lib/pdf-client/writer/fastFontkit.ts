import fontkit from "@pdf-lib/fontkit"
import type { PDFDocument } from "pdf-lib"

/**
 * fontkit per a pdf-lib amb un `layout()` directe per cmap.
 *
 * pdf-lib crida `font.layout(text).glyphs` per codificar i per mesurar cada
 * tros de text, i el layout de fontkit aplica totes les taules GSUB/GPOS
 * (lligadures, kerning, context…): era més de la meitat del temps de
 * generació. Aquí no ens cal: les posicions ja les ha decidit el navegador
 * i cada tros es col·loca a la seva coordenada mesurada (amb ajust
 * d'amplada, vegeu text.ts). Només necessitem el glif de cada caràcter.
 *
 * Contrapartida conscient: no es dibuixen lligadures (fi, fl…). El text es
 * normalitza a NFC perquè els accents compostos tinguin glif propi.
 */

type FontkitApi = Parameters<PDFDocument["registerFontkit"]>[0]
type FontkitFont = ReturnType<typeof fontkit.create>
type FontkitGlyph = ReturnType<FontkitFont["glyphForCodePoint"]>

export const fastFontkit: FontkitApi = {
  create(buffer: Uint8Array, postscriptName?: string) {
    const font = fontkit.create(buffer, postscriptName)
    const glyphs = new Map<number, FontkitGlyph>()
    const glyphFor = (cp: number): FontkitGlyph => {
      let g = glyphs.get(cp)
      if (!g) {
        g = font.glyphForCodePoint(cp)
        glyphs.set(cp, g)
      }
      return g
    }
    const layout = (text: string) => ({
      glyphs: Array.from(text.normalize("NFC"), (ch) => glyphFor(ch.codePointAt(0) ?? 0)),
    })
    return Object.assign(font, { layout: layout as unknown as FontkitFont["layout"] })
  },
} as unknown as FontkitApi
