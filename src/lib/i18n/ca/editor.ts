// Diccionari ca — editor (/app/editor i src/components/editor/*)

export const editor = {
  page: {
    titols: {
      novaCancoTitol: "Nova cançó",
      novaCancoSubtitol: "Escriu la lletra de la cançó",
      editarCancoTitol: "Editar cançó",
      editarCancoSubtitol: "Modifica i guarda els canvis",
      modificarPropostaTitol: "Modificar proposta",
      modificarPropostaSubtitol:
        "Modifica la teva proposta i torna a enviar-la perquè un admin la revisi.",
      revisarPropostaTitol: "Revisar proposta",
      revisarPropostaCarregant: "Carregant proposta…",
      revisarPropostaDe: (nom: string) => `Proposta de ${nom}`,
    },
    backLinks: {
      lesMevesPropostes: "← Les meves propostes",
      panellAdmin: "← Panell admin",
      canconer: "← Cançoner",
    },
    saveButtons: {
      guardarCanvis: "Guardar canvis",
      modificarProposta: "Modificar Proposta",
      acceptar: "Acceptar",
      guardarCanco: "Guardar cançó",
      enviarProposta: "Enviar proposta",
    },
    resetLabels: {
      cancellarProposta: "Cancel·lar",
      descartarCanvis: "Descartar canvis",
      reset: "Reset",
    },
    placeholder: `Escriu aquí la lletra de la cançó.\nClic dret per inserir acords, clic mig per inserir seccions.`,
    seleccionaTonalitat: "Selecciona la tonalitat per a començar la cançó",
    noSHaModificatRes: "No s'ha modificat res encara",
    carregant: "Carregant…",
    bannerPropostaRebutjada: "La teva proposta va ser rebutjada.",
    retroaccioAdmin: "Retroacció de l'administrador:",
  },

  confirmToast: {
    cancellarProposta: {
      missatge:
        "Cancel·lar la proposta sencera? Es perdrà i no apareixerà a la teva llista.",
      accio: "Sí, cancel·lar",
    },
    descartarCanvis: {
      missatge:
        "Descartar els canvis i tornar al panell admin? Es perdran les modificacions no guardades.",
      accio: "Sí, descartar",
    },
    esborrarProgres: {
      missatge: "Esborrar tot el progrés? Es perdran títol, artista i contingut.",
      accio: "Sí, esborrar",
    },
    reEnviarProposta: {
      missatge:
        "Re-enviar la proposta modificada perquè un admin la torni a revisar?",
      accio: "Sí, re-enviar",
    },
    actualitzarCanco: {
      missatge: "Actualitzar la cançó a la base de dades pública?",
      accio: "Sí, actualitzar",
    },
    guardarCanco: {
      missatge: "Guardar la cançó a la base de dades pública?",
      accio: "Sí, guardar",
    },
    enviarProposta: {
      missatge: "Enviar la proposta perquè un admin la revisi?",
      accio: "Sí, enviar",
    },
    acceptarProposta: {
      missatge: "Acceptar la proposta i guardar la cançó a la base de dades?",
      accio: "Sí, acceptar",
    },
  },

  toolbar: {
    inserirSeccioTitle: "Inserir títol de secció (o clic mig sobre la lletra)",
    inserirAcordTitle: "Inserir acord (o clic dret sobre la lletra)",
    desferTitle: "Desfer (Ctrl+Z)",
    referTitle: "Refer (Ctrl+Y)",
    dreceraMatoliTitle: "Drecera ratolí",
    rebutjarPropostaTitle: "Rebutjar la proposta",
    acceptarPropostaTitle: "Acceptar la proposta i guardar la cançó",
  },

  songHeader: {
    editarTitolTitle: "Clica per editar el títol",
    editarArtistaTitle: "Clica per editar l'artista",
    editarAlbumTitle: "Clica per editar l'àlbum",
    editarAnyTitle: "Clica per editar l'any",
    canviarTonalitatTitle: "Canvia la tonalitat",
    youtubePlaceholder: "https://www.youtube.com/watch?v=...",
    youtubeUrlNoValida: "URL de YouTube no vàlida",
    spotifyPlaceholder: "https://open.spotify.com/track/...",
    spotifyUrlNoValida: "URL de Spotify no vàlida",
    celleta: "Celleta",
    idioma: "Idioma",
    catala: "Català",
    castella: "Castellà",
    angles: "Anglès",
    altre: "Altre",
    etiquetes: "Etiquetes",
    etiquetesPlaceholder: "pop, rock, tradicional…",
  },

  keyPicker: {
    tonalitat: "Tonalitat",
    majors: "Majors",
    menors: "Menors",
  },

  sectionMenu: {
    eliminarSeccio: "Eliminar secció",
    afegirSeccio: "Afegir secció",
    canviarTipus: "Canviar tipus",
  },

  chordMenu: {
    modificador: "MODIFICADOR:",
    acordsDelTo: "ACORDS DEL TO:",
    cromatics: "CROMÀTICS:",
    eliminarAcord: "Eliminar acord",
  },

  newSong: {
    titol: "Nova cançó",
    comecarDesDeEnllac: "Començar des d'un enllaç:",
    urlPlaceholder: "https://...",
    comenca: "Comença",
    important: "Important…",
    linkNoSuportat: "Link no suportat",
    introduirManualment: "Introduir manualment",
    o: "o",
    noSHaPogutImportar: "No s'ha pogut importar la cançó.",
    errorDesconegut: "Error desconegut.",
  },

  propose: {
    titol: "Proposa una cançó",
    descripcio:
      "Aquest cançoner és un projecte de passió obert a tothom. Pots col·laborar afegint cançons, però per garantir la qualitat cal tenir en compte:",
    reqFidedignes: "La lletra i els acords han de ser fidedignes a la cançó original.",
    reqTonalitat: "Ha d'estar en la tonalitat correcta (o amb celleta si escau).",
    reqCompletaPrefix: "Com més completa sigui la cançó (estrofes, tornades, ponts…),",
    reqCompletaForta: "més probable és que s'accepti",
    reqCompletaSufix: ".",
    reqRevisio: "Un administrador la revisarà abans de publicar-la.",
    hoEntenc: "Ho entenc, continua",
  },

  reject: {
    titol: (proposerName: string) => `Rebutjar proposta de ${proposerName}`,
    descripcio:
      "Explica el motiu del rebuig perquè el proposant pugui revisar la retroacció i, si vol, tornar a enviar la cançó.",
    motiuPlaceholder: "Motiu del rebuig…",
    cancellar: "Cancel·lar",
    enviar: "Enviar",
    enviant: "Enviant…",
  },

  sections: {
    estrofa: "Estrofa",
    tornada: "Tornada",
    preTornada: "Pre-tornada",
    pont: "Pont",
    solo: "Solo",
    instrumental: "Instrumental",
    interludi: "Interludi",
    intro: "Intro",
    outro: "Outro",
  },

  toasts: {
    propostaModificadaReenviada: "Proposta modificada i re-enviada!",
    cancoActualitzada: "Cançó actualitzada!",
    cancoGuardada: "Cançó guardada!",
    propostaEnviada: "Proposta enviada! Un admin la revisarà aviat.",
    errorGuardar: "Error en guardar.",
    propostaAcceptada: "Proposta acceptada!",
    errorAcceptarProposta: "Error en acceptar la proposta.",
    propostaRebutjada: "Proposta rebutjada.",
    errorRebutjarProposta: "Error en rebutjar la proposta.",
    propostaCancellada: "Proposta cancel·lada.",
    errorCancellarProposta: "Error en cancel·lar la proposta.",
    progresEsborrat: "Progrés esborrat.",
    calSerAdmin: "Cal ser administrador per a revisar propostes.",
    propostaNoTrobada: "Proposta no trobada.",
    noEtsElPropietari: "No ets el propietari d'aquesta proposta.",
    propostaNoEsPotModificar: "Aquesta proposta ja no es pot modificar.",
    propostaJaRevisada: "Aquesta proposta ja ha estat revisada.",
    noSHaPogutCarregarProposta: "No s'ha pogut carregar la proposta.",
    noSHaPogutCarregarCanco: "No s'ha pogut carregar la cançó.",
    titolArtistaContingutObligatoris: "Títol, artista i contingut són obligatoris.",
    youtubeNoValid: "Link de YouTube no vàlid.",
    spotifyNoValid: "Link de Spotify no vàlid.",
    calOmplirLinksPerProposta:
      "Cal omplir els links de YouTube i Spotify per a enviar una proposta.",
  },

  wysiwyg: {
    reproductorYoutube: "Reproductor YouTube",
  },

  findBar: {
    cercaPlaceholder: "Cerca…",
    reemplacaPlaceholder: "Reemplaça per…",
    anteriorTitle: "Anterior (Maj+Enter)",
    seguentTitle: "Següent (Enter)",
    reemplaca: "Reemplaça",
    reemplacaTot: "Reemplaça tot",
    reemplacaTitle: "Reemplaça la coincidència actual",
    reemplacaTotTitle: "Reemplaça totes les coincidències",
    tancaTitle: "Tanca (Esc)",
    senseResultats: "Sense resultats",
    // (n de N) — index 1-based de la coincidència activa sobre el total.
    comptador: (actual: number, total: number) => `${actual} de ${total}`,
  },
} as const
