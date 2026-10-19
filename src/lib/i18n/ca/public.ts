// Diccionari ca — àrea pública (/, /songs, /projecte, /contacte i components public/)

export const public_ = {
  nav: {
    inici: "Inici",
    wordmark: "guitarreo.cat",
    navPrincipal: "Principal",
    cancons: "Cançons",
    elProjecte: "El projecte",
    contacte: "Contacte",
    cercaPlaceholder: "Cerca cançons o artistes…",
    iniciaSessio: "Inicia sessió",
    continuaAmbGoogle: "Continua amb Google",
  },

  searchHero: {
    ariaLabel: "Cerca de cançons, artistes i cançoners",
    esborraAriaLabel: "Esborra la cerca",
    cercant: "Cercant…",
    artistes: "Artistes",
    cancons: "Cançons",
    sensResultats: (q: string) => `No hi ha resultats per a "${q}".`,
    songCount: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
    lesTevesCancons: "Les teves cançons",
    canconers: "Cançoners",
    canconerDe: (artistes: string, n: number) => `${artistes} · ${n === 1 ? "1 cançó" : `${n} cançons`}`,
    tipus: {
      public: "Pública",
      private: "Privada",
      arrangement: "Arranjament",
      proposal: "Proposta pendent",
    },
  },

  inspirat: {
    titol: "Inspira't",
    subtitol: "— Cançons al·leatòries",
    tiraDauAriaLabel: "Tira el dau per veure altres cançons",
    tiraDauTitle: "Tira el dau",
  },

  home: {
    claim: "Acords i lletres en català — i un editor de cançoners propi.",
    wordmark: "guitarreo.cat",
    creaCanconerCta: "Crea un cançoner",
    exploraElCataleg: "Explora el catàleg",
    ultimesIncorporades: "Últimes incorporades",
    veureTotes: "Veure totes →",
  },

  songsIndex: {
    saltarAInicialAriaLabel: "Saltar a inicial",
    modeIndexAriaLabel: "Mode d'índex",
    vesALEditor: "Vés a l'editor",
    catalogCancons: "Catàleg de cançons",
    catalogArtistes: "Catàleg d'artistes",
    perCanco: "Per cançó",
    perArtista: "Per artista",
    encaNoPublicat: "Encara no hi ha res publicat",
    buitText: (editorHref: string) =>
      `Quan hi hagi cançons publicades, apareixeran aquí. ` +
      `<a href="${editorHref}">Vés a l'editor</a> per proposar-ne.`,
    countCancons: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
    countArtistes: (n: number) => (n === 1 ? "1 artista" : `${n} artistes`),
  },

  publicArtist: {
    artista: "Artista",
    countCancons: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
  },

  publicSong: {
    separadorI: "i",
    fesLaTevaVersio: "Fes-ne la teva versió",
    fesLaTevaVersioHint: "Canvia acords o lletra i desa-la com a arranjament privat teu.",
    editar: "Edita",
    arranjamentDe: "Arranjament de",
    nomesTu: "només el veus tu",
    cancoPrivada: "Cançó privada: només la veus tu",
    propostaPendent: "Proposta pendent de revisió: només la veus tu",
    controls: {
      ariaLabel: "Controls de la cançó",
      transposicio: "Transposició",
      canviarTonalitat: "Canviar tonalitat",
      baixaUnSemito: "Baixa un semitò",
      restablirTonalitatTitle: "Tornar a la tonalitat original",
      restablirTonalitatAriaLabel: "Restablir tonalitat",
      pujaUnSemito: "Puja un semitò",
      midaDeLaFont: "Mida de la font",
      reduirMida: "Reduir mida",
      augmentarMida: "Augmentar mida",
      notacio: "Notació",
      mostrarBemolls: "Mostrar bemolls",
      mostrarSostinguts: "Mostrar sostinguts",
      autoscroll: "Autoscroll",
      velocitatAutoscroll: "Velocitat autoscroll",
      triaUnaVelocitat: "Tria una velocitat",
      velocitat: "Velocitat",
      velocitatN: (n: number) => `Velocitat ${n}`,
      aturar: "Aturar",
      auto: "Auto",
      original: "Original",
    },
    obrirEnllacAriaLabel: "Obrir enllaç de la cançó",
    separadorIConjuncio: " i ",
    comencaCanconerCta: "Comença un cançoner",
    comencaCanconerCtaLlarg: "Comença un cançoner amb aquesta cançó →",
    comencaCanconerHint:
      "Crea un llibret amb les teves cançons preferides, transposa-les i exporta-les en PDF.",
    celleta: (n: number) => `Celleta ${n}`,
  },

  projecte: {
    titol: "El projecte",
    lede: "Una eina lliure per llegir, transposar i organitzar cançons amb acords en català.",
    queEs: "Què és",
    donVe: "D'on ve",
    perQue: "Per què",
    queEsText:
      "guitarreo.cat és un lloc per trobar la lletra i els acords de les cançons que t'agraden, i per crear-te els teus propis cançoners imprimibles. Pots transposar qualsevol cançó a la tonalitat que t'encaixi millor i exportar el resultat en PDF.",
    donVeText:
      "Va començar com una eina personal per cantar amb els amics i ha crescut fins a esdevenir aquest petit catàleg col·laboratiu. Tothom pot proposar cançons noves; un equip petit les revisa abans de publicar-les.",
    perQueText:
      "Perquè cantar en català té sentit, perquè els cançoners de paper són bonics, i perquè un acord ben col·locat val mil paraules.",
  },

  contacte: {
    titol: "Contacte",
    lede: "Suggeriments, errades, propostes de cançons o qualsevol altra cosa.",
    emailTitol: "Email",
    emailAdresa: "hola@guitarreo.cat",
    quiSomTitol: "Qui som",
    formulariTitol: "Formulari de contacte",
    formulariPropertyament: "(Properament) formulari per a missatges directes sense sortir de la web. Mentrestant, escriu-nos al correu de dalt.",
  },

  mobileGate: {
    creaCanconerCta: "Crea un cançoner",
    noDisponibleMobil:
      "Per ara l'editor de cançoners no està disponible per a dispositius mòbils.",
  },

  songbookViewer: {
    canconer: "Cançoner",
    perAutor: (autor: string) => `per ${autor}`,
    copiar: "Fes-ne una còpia",
    copiarHint: "Obre'l a l'editor com a cançoner teu per canviar-lo o afegir-hi cançons",
    copiaSensePrivades: "Les cançons privades de l'autor no es copien: només es poden veure dins d'aquest cançoner.",
    editar: "Edita'l",
    buit: "Aquest cançoner encara no té cançons.",
    cancoNdeM: (n: number, m: number) => `${n} de ${m}`,
    anterior: "Anterior",
    seguent: "Següent",
    navegacio: "Navegació del cançoner",
    privadaTitle: "Cançó privada: només es veu dins d'aquest cançoner",
  },

  songbooksHome: {
    titol: "Descobreix cançoners",
    subtitol: "— Fets per la comunitat",
    tiraDauAriaLabel: "Tira el dau per veure altres cançoners",
    tiraDauTitle: "Tira el dau",
    numCancons: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
    per: (autor: string) => `per ${autor}`,
    /** "Els Pets, Auxili i 3 més" (els dos amb més cançons i quants més n'hi ha). */
    artistes: (top: string[], total: number) => {
      const rest = total - top.length
      if (rest > 0) return `${top.join(", ")} i ${rest} més`
      return top.length === 2 ? `${top[0]} i ${top[1]}` : (top[0] ?? "")
    },
  },

  sharedView: {
    index: "Índex",
    errorGenerantPdf: "Error generant el PDF.",
    per: "Per",
    canconerBack: "← Cançoner",
    generantPdf: "Generant…",
    descarregarPdf: "Descarregar PDF",
    cancons: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
  },

  loginPopup: {
    benvingut: "Benvingut al Cançoner",
    descripcio: "Inicia sessió per guardar els teus cançoners i molt més.",
    continuaAmbGoogle: "Continua amb Google",
    notaTermes: "En iniciar sessió acceptes els termes d'ús.",
    tancarAriaLabel: "Tancar",
  },
} as const
