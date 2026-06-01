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
    ariaLabel: "Cerca de cançons i artistes",
    esborraAriaLabel: "Esborra la cerca",
    cercant: "Cercant…",
    artistes: "Artistes",
    cancons: "Cançons",
    sensResultats: (q: string) => `No hi ha resultats per a "${q}".`,
    songCount: (n: number) => (n === 1 ? "1 cançó" : `${n} cançons`),
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
      autoscroll: "Autoscroll",
      velocitatAutoscroll: "Velocitat autoscroll",
      triaUnaVelocitat: "Tria una velocitat",
      velocitat: "Velocitat",
      velocitatN: (n: number) => `Velocitat ${n}`,
      aturar: "■ Aturar",
      auto: "▶ Auto",
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

  sharedView: {
    index: "Índex",
    errorGenerantPdf: "Error generant el PDF.",
    per: "Per",
    canconerBack: "← Cançoner",
    generantPdf: "⏳ Generant…",
    descarregarPdf: "📄 Descarregar PDF",
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
