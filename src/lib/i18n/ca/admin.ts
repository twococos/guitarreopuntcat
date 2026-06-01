// Diccionari ca — àrea admin (/app/admin, /app/admin/import, src/components/admin/*)

export const admin = {
  dashboard: {
    titol: "Panell d'administració",
    benvingut: (nom: string) => `Benvingut, ${nom}`,
    backLink: "← Cançoner",
    backImportLink: "← Panell d'administració",
  },

  tabs: {
    resum: "Resum",
    propostes: "Propostes",
    cancons: "Cançons",
    usuaris: "Usuaris",
    canconers: "Cançoners",
  },

  statsCards: {
    canconsPubliques: "Cançons públiques",
    esborranys: "Esborranys",
    usuaris: "Usuaris",
    canconers: "Cançoners",
  },

  songsTab: {
    cercaPlaceholder: "Cerca…",
    colTitol: "Títol",
    colArtista: "Artista",
    colTo: "To",
    colEstat: "Estat",
    colAccions: "Accions",
    confirmEliminar: (titol: string) =>
      `Eliminar la cançó "${titol}"? Aquesta acció no es pot desfer.`,
    capCancoTrobada: "Cap cançó trobada",
    editar: "Editar",
    eliminar: "Eliminar",
    estatPublica: "Pública",
    estatPrivada: "Privada",
    estatPendent: "Pendent",
    estatRebutjada: "Rebutjada",
    estatCancellada: "Cancel·lada",
  },

  usersTab: {
    colUsuari: "Usuari",
    colEmail: "Email",
    colRol: "Rol",
    colCanconers: "Cançoners",
    colRegistre: "Registre",
    colAccions: "Accions",
    tu: "(tu)",
    confirmToggleRol: (label: string, nom: string) => `Vols ${label} a ${nom}?`,
    confirmToggleActiu: (accio: string, nom: string) =>
      `Vols ${accio} l'usuari ${nom}?`,
    ferAdmin: "Fer admin",
    ferUsuari: "Fer usuari",
    activar: "Activar",
    desactivar: "Desactivar",
    ferAdminLabel: "fer administrador",
    ferUsuariLabel: "fer usuari normal",
    activarLabel: "activar",
    desactivarLabel: "desactivar",
  },

  canconersTab: {
    cercaPlaceholder: "Cerca…",
    colTitol: "Títol",
    colUsuari: "Usuari",
    colCancons: "Cançons",
    colCompartit: "Compartit",
    colActualitzat: "Actualitzat",
    colAccions: "Accions",
    no: "No",
    veure: "Veure",
    eliminar: "Eliminar",
    capCanconerTrobat: "Cap cançoner trobat",
    confirmEliminar: (titol: string, propietari: string) =>
      `Eliminar el cançoner "${titol}" de ${propietari}?`,
  },

  proposalsTab: {
    cercaPlaceholder: "Cerca per títol, artista, àlbum o proposador…",
    pendents: "Pendents",
    aprovades: "Aprovades",
    rebutjades: "Rebutjades",
    cancellades: "Cancel·lades",
    totes: "Totes",
    ordenarPerTitle: "Ordenar per",
    capPropostaEnAquestaCategoria: "Cap proposta en aquesta categoria.",
    revisar: "Revisar",
    reEnviada: "Re-enviada",
    notaAdmin: "Nota admin:",
    proposatPer: "Proposat per",
    per: "per",
    sortLabels: {
      titol: "Títol",
      artista: "Artista",
      any: "Any de la cançó",
      album: "Àlbum",
      createdAt: "Data de la proposta",
      proposer: "Usuari proposador",
    },
    statusLabels: {
      pending: "Pendent",
      approved: "Aprovada",
      rejected: "Rebutjada",
      cancelled: "Cancel·lada",
    },
    ascendent: "Ascendent",
    descendent: "Descendent",
  },

  import: {
    titol: "Importació massiva",
    subtitol:
      "Importa cançons des d'un .csv. Es crearan propostes pendents de revisió a nom de l'usuari «Importador».",
    dropzone: {
      text: "Arrossega el CSV aquí o fes clic per seleccionar-lo",
      hint: "Format: link, títol, artista, àlbum, any, youtube, spotify, idioma, etiquetes",
    },
    scrapePanel: {
      titol: "Generador de CSV des d'una pàgina d'artista",
      hint: "Introdueix un link d'un artista d'acordscatala.cat o d'ultimate-guitar.com i es generaran les files CSV de les cançons llistades.",
      urlPlaceholder:
        "https://www.acordscatala.cat/ca/artista o https://www.ultimate-guitar.com/artist/…",
      nombreCansonsTitol: "Nombre de cançons a importar (1-100)",
      buscar: "Buscar",
      cercar: "Cercar",
      buscant: "Buscant…",
      cansonsTrobades: (artista: string, n: number) =>
        `${artista} · ${n} cançons trobades`,
      copiar: "Copiar",
      descarregar: ".csv",
      afegirALaCua: "Afegir a la cua",
      carregarALaCua: "Carregar a la cua",
    },
    preview: {
      cancellar: "Cancel·lar",
      buscarLinksTitle:
        "Cerca a YouTube i Spotify els links que falten (només omple buits)",
      buscarLinksFalten: "Buscar links que falten",
      buscantLinks: (fet: number, total: number) =>
        `Buscant… ${fet}/${total}`,
      importar: "Importar",
      importantProgres: (fet: number, total: number) => `${fet} / ${total}`,
      acabatPrefix: "Acabat:",
      acabatDuplicades: (dup: number) => `${dup} duplicades`,
      acabatErrors: (err: number) => `${err} errors`,
      novaImportacio: "Nova importació",
      campsObligatoris:
        "Camps obligatoris (les files que no compleixin se saltaran):",
      colLink: "Link web",
      mostrarLlista: (n: number) => `Mostrar llista (${n})`,
      amagarLlista: (n: number) => `Amagar llista (${n})`,
      sensseValidar: "sense validar",
      hostNoSuportat: "(host no suportat)",
      importarIgualment: "Importar igualment",
      importarIgualmentTitle:
        "Marca aquesta fila per importar saltant la validació de camps requerits al següent 'Importar'",
      editarCampsAriaLabel: "Editar camps",
      treureDeLaCuaTitle: "Treure aquesta fila de la cua",
      treureDeLaCuaAriaLabel: "Treure de la cua",
    },
    editRow: {
      urlLabel: "URL",
      titolLabel: "Títol *",
      artistaLabel: "Artista *",
      albumLabel: "Àlbum",
      anyLabel: "Any",
      idiomaLabel: "Idioma",
      youtubeLabel: "YouTube",
      youtubePlaceholder: "https://www.youtube.com/watch?v=…",
      spotifyLabel: "Spotify",
      spotifyPlaceholder: "https://open.spotify.com/track/…",
      etiquetesLabel: "Etiquetes",
      etiquetesPlaceholder: "separades per comes",
    },
  },

  toasts: {
    canconsTrobades: (added: number, total: number) =>
      `${added} cançons afegides · ${total} ja hi eren (omeses)`,
    canconAfegides: (n: number) => `${n} cançons afegides a la cua`,
    errorParsejantCsv: "Error al parsejar el CSV",
    copiat: "Copiat al porta-retalls",
    errorCopiar: "No s'ha pogut copiar",
    totesJaHiEren: "Totes les cançons ja eren a la cua",
  },
} as const
