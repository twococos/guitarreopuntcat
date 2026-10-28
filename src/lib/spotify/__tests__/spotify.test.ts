/**
 * src/lib/spotify/__tests__/spotify.test.ts
 * Tests dels enllaços de Spotify, la neteja de títols i la lectura del reproductor incrustat.
 * Execució: npx tsx src/lib/spotify/__tests__/spotify.test.ts
 */

import { cleanTrackTitle, looksLikeSpotifyLink, parseSpotifyRef, releaseYear } from "../url.js"
import { parseEmbedHtml } from "../embed.js"

let failed = false

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failed = true
    console.error(`  FALLA: ${label}`)
    console.error(`    esperat: ${JSON.stringify(expected)}`)
    console.error(`    obtingut: ${JSON.stringify(actual)}`)
  }
}

const ID = "2sFepQNyl1WjpROruP8bJ0"

console.log("Enllaços")
{
  assertEqual(parseSpotifyRef(`https://open.spotify.com/track/${ID}?si=abc`), { kind: "track", id: ID }, "cançó")
  assertEqual(parseSpotifyRef(`https://open.spotify.com/intl-es/playlist/${ID}`), { kind: "playlist", id: ID }, "llista intl")
  assertEqual(parseSpotifyRef(`https://open.spotify.com/embed/album/${ID}`), { kind: "album", id: ID }, "àlbum incrustat")
  assertEqual(parseSpotifyRef(`spotify:artist:${ID}`), { kind: "artist", id: ID }, "URI")
  assertEqual(parseSpotifyRef(`https://open.spotify.com/show/${ID}`), null, "podcast no")
  assertEqual(parseSpotifyRef("els pets bon dia"), null, "text")
  assertEqual(parseSpotifyRef(`https://example.com/track/${ID}`), null, "un altre domini")
  assertEqual(looksLikeSpotifyLink("https://spotify.link/AbCdEf"), true, "enllaç curt")
  assertEqual(looksLikeSpotifyLink("bon dia"), false, "text no és enllaç")
}

console.log("Títols")
{
  assertEqual(cleanTrackTitle("Bohemian Rhapsody - Remastered 2011"), "Bohemian Rhapsody", "remastered any")
  assertEqual(cleanTrackTitle("Help! - Remastered 2009 - Mono"), "Help!", "dos afegits")
  assertEqual(cleanTrackTitle("Song (2015 Remaster)"), "Song", "parèntesi")
  assertEqual(cleanTrackTitle("Song - Single Version"), "Song", "single version")
  assertEqual(cleanTrackTitle("Song - Radio Edit"), "Song", "radio edit")
  assertEqual(cleanTrackTitle("Song - Live"), "Song - Live", "el directe es queda")
  assertEqual(cleanTrackTitle("Song (Acoustic)"), "Song (Acoustic)", "l'acústica es queda")
  assertEqual(cleanTrackTitle("Remaster"), "Remaster", "no deixa el títol buit")
  assertEqual(releaseYear("1997-03-01"), 1997, "any de la data")
  assertEqual(releaseYear("0000"), null, "any invàlid")
}

console.log("Reproductor incrustat")
{
  const data = {
    props: {
      pageProps: {
        state: {
          data: {
            entity: {
              name: "La meva llista",
              coverArt: { sources: [{ url: "https://i.scdn.co/image/x" }] },
              trackList: [
                { uri: `spotify:track:${ID}`, title: "Bon dia", subtitle: "Els Pets, Algú", duration: 276000 },
                { uri: "spotify:episode:xxxxxxxxxxxxxxxxxxxxxx", title: "Podcast", subtitle: "", duration: 1 },
              ],
            },
          },
        },
      },
    },
  }
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`
  const e = parseEmbedHtml(html)
  assertEqual(e?.name, "La meva llista", "nom")
  assertEqual(e?.image_url, "https://i.scdn.co/image/x", "portada")
  assertEqual(e?.tracks.length, 1, "només cançons")
  assertEqual(e?.tracks[0].artists, ["Els Pets", "Algú"], "artistes")
  assertEqual(e?.tracks[0].duration_ms, 276000, "durada")
  assertEqual(parseEmbedHtml("<html></html>"), null, "sense dades")
}

if (failed) {
  console.error("\nHi ha tests que fallen.")
  process.exit(1)
}
console.log("\nTot correcte.")
