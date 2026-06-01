// Diccionari ca — metadata SEO (generateMetadata() de pàgines)

export const metadata = {
  root: {
    titleDefault: "guitarreo.cat — Acords i lletres en català",
    description:
      "Acords, lletres i cançoners personalitzats en català. Cerca cançons, transposa-les i crea el teu llibret en PDF.",
  },

  songs: {
    title: "Cançons — guitarreo.cat",
    description:
      "Catàleg complet de cançons amb acords i lletra a guitarreo.cat, navegable per títol o per artista.",
  },

  projecte: {
    title: "El projecte — guitarreo.cat",
    description:
      "Què és guitarreo.cat, qui hi ha al darrere i per què hem fet aquest projecte de cançons amb acords en català.",
  },

  contacte: {
    title: "Contacte — guitarreo.cat",
    description:
      "Contacta amb l'equip de guitarreo.cat per proposar cançons, reportar errors o fer suggeriments.",
  },

  artist: {
    title: (nom: string) => `${nom} — Cançons amb acords | guitarreo.cat`,
    descriptionSingle: (nom: string, titolCanco: string) =>
      `Acords i lletra de "${titolCanco}" de ${nom}.`,
    descriptionMultiple: (nom: string, n: number, mostra: string) =>
      `${n} cançons de ${nom} amb acords i lletra${mostra ? `: ${mostra}…` : ""}`,
    ogTitle: (nom: string) => `${nom} a guitarreo.cat`,
    ogDescription: (n: number) => `${n} cançons amb acords i lletra`,
    noTrobat: "Artista no trobat — guitarreo.cat",
  },

  song: {
    title: (titol: string, artista: string) =>
      `${titol} — ${artista} | Acords i lletra | guitarreo.cat`,
    descriptionFallback: (titol: string, artista: string) =>
      `Acords i lletra de "${titol}" de ${artista}. Transposició i autoscroll inclosos.`,
    ogTitle: (titol: string, artista: string) => `${titol} — ${artista}`,
    ogDescription: "Acords i lletra a guitarreo.cat",
    noTrobada: "Cançó no trobada — guitarreo.cat",
  },
} as const
