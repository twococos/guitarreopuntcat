// Normalitza els TTF de public/fonts/ perquè @pdf-lib/fontkit els pugui
// incrustar (amb subset) al PDF generat al client.
//
//   node scripts/normalize-fonts.mjs            → tots els .ttf de public/fonts
//   node scripts/normalize-fonts.mjs a.ttf b.ttf → només aquests
//
// Per què: @pdf-lib/fontkit (fork de fontkit 1.x) té dos bugs amb fonts
// amb hinting (Cousine, Inconsolata):
//   1. El subset escriu `loca` en format curt (offset/2) però copia cada
//      glif amb la seva longitud original. Si una longitud és senar, els
//      offsets següents queden desalineats i els glifs desapareixen del PDF
//      sense cap error.
//   2. En llegir un glif buit no comprova que ho sigui; si `glyf` és l'última
//      taula del fitxer, llegeix fora del buffer i l'embedding peta.
//
// Solució: reescriure `glyf` amb cada glif alineat a 4 bytes (el que
// recomana l'especificació), `loca` en format llarg, i les taules en ordre
// alfabètic (`glyf` deixa de ser l'última). Els contorns no canvien: és
// idempotent i el navegador renderitza exactament igual.
//
// Si afegeixes una font nova a public/fonts, passa-la per aquest script.

import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts")

function checksum(buf) {
  const padded = Buffer.alloc((buf.length + 3) & ~3)
  buf.copy(padded)
  let sum = 0
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0
  return sum
}

function normalize(input) {
  const numTables = input.readUInt16BE(4)
  const tables = new Map()
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = input.toString("latin1", rec, rec + 4)
    const offset = input.readUInt32BE(rec + 8)
    const length = input.readUInt32BE(rec + 12)
    tables.set(tag, Buffer.from(input.subarray(offset, offset + length)))
  }
  const head = tables.get("head")
  const maxp = tables.get("maxp")
  const loca = tables.get("loca")
  const glyf = tables.get("glyf")
  if (!head || !maxp || !loca || !glyf) throw new Error("No és un TTF amb contorns glyf")

  const numGlyphs = maxp.readUInt16BE(4)
  const longLoca = head.readInt16BE(50) === 1
  const offsets = []
  for (let i = 0; i <= numGlyphs; i++) {
    offsets.push(longLoca ? loca.readUInt32BE(i * 4) : loca.readUInt16BE(i * 2) * 2)
  }

  // glyf amb cada glif alineat a 4 bytes + loca llarg
  const parts = []
  const newLoca = Buffer.alloc((numGlyphs + 1) * 4)
  let pos = 0
  for (let i = 0; i < numGlyphs; i++) {
    newLoca.writeUInt32BE(pos, i * 4)
    const data = glyf.subarray(offsets[i], offsets[i + 1])
    const padded = Buffer.alloc((data.length + 3) & ~3)
    data.copy(padded)
    parts.push(padded)
    pos += padded.length
  }
  newLoca.writeUInt32BE(pos, numGlyphs * 4)
  tables.set("glyf", Buffer.concat(parts))
  tables.set("loca", newLoca)
  head.writeInt16BE(1, 50) // indexToLocFormat = long
  head.writeUInt32BE(0, 8) // checkSumAdjustment, es recalcula al final

  // Reconstrucció: taules en ordre alfabètic, alineades a 4 bytes
  const tags = [...tables.keys()].sort()
  const n = tags.length
  let entrySelector = 0
  while (1 << (entrySelector + 1) <= n) entrySelector++
  const searchRange = (1 << entrySelector) * 16
  const header = Buffer.alloc(12 + n * 16)
  input.copy(header, 0, 0, 4) // sfntVersion
  header.writeUInt16BE(n, 4)
  header.writeUInt16BE(searchRange, 6)
  header.writeUInt16BE(entrySelector, 8)
  header.writeUInt16BE(n * 16 - searchRange, 10)

  const bodies = []
  let offset = header.length
  tags.forEach((tag, i) => {
    const data = tables.get(tag)
    const rec = 12 + i * 16
    header.write(tag, rec, 4, "latin1")
    header.writeUInt32BE(checksum(data), rec + 4)
    header.writeUInt32BE(offset, rec + 8)
    header.writeUInt32BE(data.length, rec + 12)
    const padded = Buffer.alloc((data.length + 3) & ~3)
    data.copy(padded)
    bodies.push(padded)
    offset += padded.length
  })
  const out = Buffer.concat([header, ...bodies])
  const headOffset = header.readUInt32BE(12 + tags.indexOf("head") * 16 + 8)
  out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOffset + 8)
  return out
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(FONTS_DIR)
      .filter((f) => f.endsWith(".ttf"))
      .map((f) => join(FONTS_DIR, f))

for (const file of files) {
  const before = readFileSync(file)
  const after = normalize(before)
  writeFileSync(file, after)
  console.log(`${file}: ${before.length} → ${after.length} bytes`)
}
