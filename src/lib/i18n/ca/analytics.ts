export const analytics = {
  title: "Analítica",

  tabs: {
    summary: "Resum",
    pages: "Pàgines",
    searches: "Cerques",
    geo: "Geografia",
    suspicious: "Sospitosos",
  },

  metrics: {
    pageViews: "Visualitzacions",
    uniqueSessions: "Sessions úniques",
    botsFiltered: "Bots filtrats",
    signins: "Inicis de sessió",
    pdfDownloads: "Descàrregues PDF",
    avgEngagement: "Temps mig actiu",
  },

  range: {
    label: "Període",
    last7: "Últims 7 dies",
    last30: "Últims 30 dies",
    last90: "Últims 90 dies",
  },

  trend: {
    up: (pct: number) => `+${pct}% respecte al període anterior`,
    down: (pct: number) => `${pct}% respecte al període anterior`,
    flat: "Sense canvi",
  },

  pages: {
    title: "Pàgines més visitades",
    colPath: "Pàgina",
    colViews: "Visites",
    colAvgEngagement: "Temps mig actiu",
    colArtist: "Artista",
    colTitle: "Títol",
    colPct: "% del total",
    empty: "Cap visita en aquest període.",
    subtabs: {
      all: "Totes",
      public: "Públiques",
      app: "App",
      songs: "Cançons",
      artists: "Artistes",
      api: "API",
    },
    aggregate: {
      totalViews: "Visites totals",
      uniquePaths: "Pàgines úniques",
      avgViewsPerPath: "Visites / pàgina",
      avgEngagement: "Temps mig actiu",
    },
    songsTitle: "Cançons més visitades",
    artistsTitle: "Artistes més visitats",
    distribution: "Distribució en el temps (% del total diari)",
  },

  searches: {
    topTitle: "Cerques més freqüents",
    zeroTitle: "Cerques sense resultats",
    colQuery: "Terme cercat",
    colCount: "Vegades",
    colAvgResults: "Mitjana de resultats",
    emptyTop: "Cap cerca en aquest període.",
    emptyZero: "Cap cerca sense resultats. Bona feina!",
  },

  geo: {
    title: "Sessions per país",
    colCountry: "País",
    colSessions: "Sessions",
    empty: "Encara no hi ha dades de país. Cal la base de dades GeoLite2-Country.mmdb a data/.",
    geoipMissing: "Base de dades GeoIP no instal·lada — visites sense país.",
  },

  suspicious: {
    title: "IPs sospitoses",
    description: "IPs que han superat el llindar de visites per minut. La columna 'Hash' permet identificar repeticions sense exposar la IP.",
    colHash: "Hash IP",
    colMinute: "Minut",
    colCount: "Visites",
    colCountry: "País",
    colIp: "IP raw",
    colStatus: "Estat",
    colActions: "Accions",
    ipHidden: "(anonimitzat)",
    blocked: "Bloquejada",
    notBlocked: "Activa",
    block: "Bloquejar",
    unblock: "Desbloquejar",
    confirmBlock: "Segur que vols bloquejar aquesta IP? El middleware li retornarà 403 en cada visita posterior.",
    confirmUnblock: "Treure el bloqueig d'aquesta IP?",
    blockReasonPrompt: "Motiu del bloqueig (opcional):",
    blockedTitle: "IPs bloquejades",
    emptySuspicious: "Cap IP sospitosa en aquest moment.",
    emptyBlocked: "Cap IP bloquejada actualment.",
  },

  charts: {
    pageViews: "Visualitzacions diàries",
    uniqueSessions: "Sessions úniques diàries",
  },

  errors: {
    loadFailed: "Error en carregar les dades.",
    blockFailed: "No s'ha pogut bloquejar la IP.",
    unblockFailed: "No s'ha pogut desbloquejar la IP.",
  },

  loading: "Carregant…",
  empty: "Sense dades per al període seleccionat.",
} as const
