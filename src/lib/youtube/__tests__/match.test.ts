/**
 * src/lib/youtube/__tests__/match.test.ts
 * Tests de la lectura dels resultats de YouTube i de la tria del vídeo d'una cançó.
 * Execució: npx tsx src/lib/youtube/__tests__/match.test.ts
 */

import { parseClock, parseSearchResults, type YtCandidate } from "../searchResults.js"
import { normalize, rankCandidates } from "../match.js"

let failed = false

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed = true
    console.error(`  FALLA: ${label}`)
    console.error(`    esperat: ${JSON.stringify(expected)}`)
    console.error(`    obtingut: ${JSON.stringify(actual)}`)
  }
}

function video(id: string, title: string, channel: string, length: string, badge?: string) {
  return {
    videoRenderer: {
      videoId: id,
      title: { runs: [{ text: title }] },
      lengthText: { simpleText: length },
      ownerText: { runs: [{ text: channel }] },
      viewCountText: { simpleText: "1,213,882 views" },
      ownerBadges: badge ? [{ metadataBadgeRenderer: { style: badge } }] : undefined,
    },
  }
}

console.log("Resultats de la cerca")
{
  const data = {
    contents: {
      sectionListRenderer: {
        contents: [
          { itemSectionRenderer: { contents: [video("XgwnYXOfIkk", "Els Pets - Bon dia", "discmedielspets", "4:35")] } },
          { itemSectionRenderer: { contents: [video("xoCfuhwUGXU", "Bon Dia", "Els Pets - Topic", "4:36")] } },
          { itemSectionRenderer: { contents: [video("XgwnYXOfIkk", "duplicat", "x", "1:00")] } },
        ],
      },
    },
  }
  const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`
  const r = parseSearchResults(html)
  assertEqual(r.length, 2, "sense duplicats")
  assertEqual(r[0].duration_s, 275, "durada")
  assertEqual(r[0].views, 1213882, "visualitzacions")
  assertEqual(r[1].topic, true, "canal Topic")
  assertEqual(parseClock("1:02:03"), 3723, "hores")
  assertEqual(parseSearchResults("<html></html>"), [], "pàgina sense dades")
  assertEqual(normalize("Àngel  Guimerà!"), "angel guimera", "normalitza")
}

function cand(p: Partial<YtCandidate> & { video_id: string; title: string }): YtCandidate {
  return { channel: "", duration_s: 354, views: 1_000_000, official: false, topic: false, ...p }
}

console.log("Tria del vídeo")
{
  const track = { title: "Bohemian Rhapsody", artists: ["Queen"], duration_ms: 354_320 }
  const ranked = rankCandidates(track, [
    cand({ video_id: "live", title: "Queen - Bohemian Rhapsody (Live Aid 1985)", channel: "Queen Official", duration_s: 165 }),
    cand({
      video_id: "clip",
      title: "Queen – Bohemian Rhapsody (Official Video Remastered)",
      channel: "Queen Official",
      duration_s: 360,
      official: true,
    }),
    cand({ video_id: "studio", title: "Bohemian Rhapsody (Remastered 2011)", channel: "Queen - Topic", duration_s: 355, topic: true }),
    cand({ video_id: "cover", title: "Bohemian Rhapsody cover", channel: "Algú", duration_s: 354 }),
  ])
  assertEqual(ranked[0].video_id, "studio", "guanya l'àudio d'estudi")
  assertEqual(ranked[0].confidence, "high", "amb confiança alta")
  assertEqual(ranked[ranked.length - 1].video_id, "live", "el directe retallat, l'últim")
  assertEqual(ranked.find((c) => c.video_id === "cover")?.other_version, "cover", "detecta la versió")
  assertEqual(ranked.find((c) => c.video_id === "clip")?.delta_s, 6, "diferència de durada")

  // Si la cançó de Spotify ja és en directe, «live» no penalitza
  const live = rankCandidates({ title: "Bon dia - Live", artists: ["Els Pets"], duration_ms: 300_000 }, [
    cand({ video_id: "a", title: "Els Pets - Bon dia (Live)", channel: "Els Pets", duration_s: 301 }),
  ])
  assertEqual(live[0].other_version, null, "directe demanat")
  assertEqual(live[0].confidence, "high", "directe demanat, confiança alta")

  const none = rankCandidates(track, [cand({ video_id: "x", title: "Una altra cosa", channel: "X", duration_s: 120 })])
  assertEqual(none[0].confidence, "low", "res a veure: confiança baixa")
}

if (failed) {
  console.error("\nHi ha tests que fallen.")
  process.exit(1)
}
console.log("\nTot correcte.")
