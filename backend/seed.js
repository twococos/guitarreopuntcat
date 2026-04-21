/**
 * Seed: insereix cançons de mostra a la base de dades.
 * Executa amb: node backend/seed.js
 */

const db = require("./db")

const songs = [
  {
    title: "La Balanguera",
    artist: "Tradicional",
    key: "Am",
    capo: 0,
    language: "ca",
    tags: "tradicional,catalana",
    content: `<ch>Am</ch>La Balanguera fila, fila,
<ch>E7</ch>la Balanguera filarà.
<ch>Am</ch>Dins la boira dels segles <ch>Dm</ch>guaita
<ch>E7</ch>i encadena el fil que <ch>Am</ch>no s'ha romput.`,
  },
  {
    title: "El meu avi",
    artist: "Lluís Llach",
    key: "G",
    capo: 0,
    language: "ca",
    tags: "llach,catalana",
    content: `<ch>G</ch>El meu avi va anar a la <ch>C</ch>guerra,
<ch>G</ch>i mai més no va <ch>D7</ch>tornar.
<ch>G</ch>La meva àvia el va <ch>C</ch>esperar
<ch>D7</ch>fins al darrer <ch>G</ch>dia.`,
  },
  {
    title: "Yesterday",
    artist: "The Beatles",
    key: "F",
    capo: 0,
    language: "en",
    tags: "beatles,pop",
    content: `<ch>F</ch>Yesterday, <ch>Em7</ch>all my <ch>A7</ch>troubles seemed so <ch>Dm</ch>far away,
    <ch>Bb</ch>now it looks as <ch>C7</ch>though they're <ch>F</ch>here to stay,
<ch>Dm</ch>oh I <ch>G</ch>believe in <ch>Bb</ch>yester<ch>F</ch>day.`,
  },
]

const insert = db.prepare(
  "INSERT OR IGNORE INTO songs (title, artist, key, capo, content, language, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
)

const insertMany = db.transaction((songs) => {
  for (const s of songs) {
    insert.run(s.title, s.artist, s.key, s.capo, s.content, s.language, s.tags)
  }
})

insertMany(songs)
console.log(`✅ ${songs.length} cançons de mostra inserides.`)
