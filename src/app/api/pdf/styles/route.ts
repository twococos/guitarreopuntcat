import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * CSS de cançó per a l'iframe on el client maqueta el PDF
 * (src/lib/pdf-client/frame.ts). L'iframe NO carrega globals.css, només
 * això: song.css + song-styles.css, la font única dels estils de cançó.
 *
 * song.css fa `@import "./song-styles.css"`, que aquí no resoldria (la
 * ruta és relativa a src/styles), així que concatenem els dos fitxers i
 * traiem l'@import.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function readSongCss(): string {
  const dir = join(process.cwd(), "src", "styles")
  const song = readFileSync(join(dir, "song.css"), "utf8").replace(
    /@import\s+["'][^"']*song-styles\.css["']\s*;?/g,
    "",
  )
  const styles = readFileSync(join(dir, "song-styles.css"), "utf8")
  return song + "\n" + styles
}

export function GET() {
  return new Response(readSongCss(), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  })
}
