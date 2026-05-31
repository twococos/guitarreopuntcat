/**
 * Generador de CSV (admin): donat un link a una pàgina d'artista d'una web
 * suportada, descarrega la pàgina i extreu el llistat de cançons (amb àlbum
 * i any si es detecta) per ajudar a construir el CSV d'importació massiva.
 *
 * Suport actual:
 *   - www.acordscatala.cat amb URLs del tipus
 *     https://www.acordscatala.cat/ca/{slug-artista}
 *   - www.ultimate-guitar.com amb URLs del tipus
 *     https://www.ultimate-guitar.com/artist/{slug-id}
 *     (s'afegeixen ?filter=chords&sort=hits automàticament i s'agafen
 *     les primeres N cançons úniques, deduplicant per títol i mantenint
 *     la versió amb més vots)
 *
 * Resposta:
 *   { source, artist: string, songs: Array<{ url, title, album?, year? }> }
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { parse } from "node-html-parser"
import { requireAdmin } from "@/lib/session"
import { defaultFetch } from "@/lib/importers/fetch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  url: z.string().url(),
  // Només s'aplica a ultimate-guitar. Per defecte 20, màxim 100 (que és el
  // que UG renderitza per pàgina sense paginar).
  limit: z.number().int().min(1).max(100).optional(),
})

interface ScrapedSong {
  url: string
  title: string
  album?: string
  year?: number
}

type Source = "acordscatala" | "ultimateGuitar"

interface ScrapeResult {
  source: Source
  artist: string
  songs: ScrapedSong[]
}

export async function POST(req: Request): Promise<Response> {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "URL no vàlida." }, { status: 400 })
  }

  let u: URL
  try {
    u = new URL(parsed.data.url)
  } catch {
    return NextResponse.json({ error: "URL no vàlida." }, { status: 400 })
  }

  const scraper = pickScraper(u)
  if (!scraper) {
    return NextResponse.json(
      {
        error:
          "Web no suportada. Actualment: acordscatala.cat/ca/{artista} o ultimate-guitar.com/artist/{slug}",
      },
      { status: 400 },
    )
  }

  const limit = parsed.data.limit ?? 20

  try {
    const result = await scraper(u, limit)
    if (result.songs.length === 0) {
      return NextResponse.json(
        { error: "No s'ha trobat cap cançó en aquesta pàgina." },
        { status: 422 },
      )
    }
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconegut"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type Scraper = (url: URL, limit: number) => Promise<ScrapeResult>

function pickScraper(u: URL): Scraper | null {
  const host = u.hostname.toLowerCase()
  if (host === "www.acordscatala.cat" || host === "acordscatala.cat") {
    // Path esperat: /ca/{slug}  (un sol segment després de /ca/)
    const segments = u.pathname.split("/").filter(Boolean)
    if (segments.length === 2 && segments[0] === "ca") {
      return async (url) => {
        const html = await defaultFetch(url.toString())
        return scrapeAcordsCatala(html, url)
      }
    }
    return null
  }
  if (
    host === "www.ultimate-guitar.com" ||
    host === "ultimate-guitar.com" ||
    host.endsWith(".ultimate-guitar.com")
  ) {
    // Path esperat: /artist/{slug-id}
    const segments = u.pathname.split("/").filter(Boolean)
    if (segments.length >= 2 && segments[0] === "artist") {
      return (url, limit) => scrapeUltimateGuitar(url, limit)
    }
    return null
  }
  return null
}

/* ──────────────────────────── acordscatala.cat ──────────────────────────── */

function scrapeAcordsCatala(html: string, url: URL): ScrapeResult {
  const root = parse(html)

  // Bloc principal: <section class="info_grup">
  //   <div class="header_grup"><h1>Artista</h1>…</div>
  //   <div class="cancons_grup"><div class="widget"><ul><li>…</li></ul></div></div>
  const section = root.querySelector("section.info_grup")
  if (!section) {
    throw new Error("No s'ha trobat el bloc d'artista (info_grup).")
  }

  const artist = decodeText(section.querySelector(".header_grup h1")?.text ?? "")
    .trim()
  if (!artist) {
    throw new Error("No s'ha trobat el nom de l'artista.")
  }

  const list = section.querySelector(".cancons_grup ul")
  if (!list) {
    throw new Error("No s'ha trobat el llistat de cançons.")
  }

  const origin = `${url.protocol}//${url.host}`
  const songs: ScrapedSong[] = []

  for (const li of list.querySelectorAll("li")) {
    const a = li.querySelector("a")
    if (!a) continue
    const href = a.getAttribute("href") ?? ""
    if (!href) continue

    // El títol és el text directe de l'<a>, abans del <br> i el <span>.
    // node-html-parser ens dona tot el text concatenat, així que treballem
    // partint del HTML intern: ho dividim pel primer <span> i agafem la
    // part esquerra com a títol candidat.
    const inner = a.innerHTML
    const spanIdx = inner.search(/<span[\s>]/i)
    const titleHtml = spanIdx === -1 ? inner : inner.slice(0, spanIdx)
    const title = decodeText(stripTags(titleHtml)).trim()
    if (!title) continue

    const spanEl = a.querySelector("span")
    const spanText = spanEl ? decodeText(spanEl.text).trim() : ""
    const { album, year } = parseAlbumSpan(spanText)

    const fullUrl = href.startsWith("http") ? href : `${origin}${href}`

    const song: ScrapedSong = { url: fullUrl, title }
    if (album) song.album = album
    if (year !== null) song.year = year
    songs.push(song)
  }

  return { source: "acordscatala", artist, songs }
}

/** "Som riu (2014)" → { album: "Som riu", year: 2014 } */
function parseAlbumSpan(s: string): { album: string | null; year: number | null } {
  if (!s) return { album: null, year: null }
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(s)
  if (m) {
    const album = m[1].trim()
    const year = parseInt(m[2], 10)
    return { album: album || null, year }
  }
  return { album: s.trim() || null, year: null }
}

function stripTags(html: string): string {
  // <br>, <br/>, <BR /> etc → espai
  return html.replace(/<[^>]+>/g, " ")
}

/**
 * Decodifica entitats HTML comunes (acordscatala usa numèriques i nominals).
 * Reaprofita el mateix subconjunt que l'importer de cançó.
 */
function decodeText(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&middot;/g, "·")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => HTML_ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
}

const HTML_ENTITIES: Record<string, string> = {
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Agrave: "À", Egrave: "È", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ccedil: "ç", Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ",
  ouml: "ö", uuml: "ü", euml: "ë", iuml: "ï",
  auml: "ä", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
}

/* ──────────────────────────── ultimate-guitar.com ──────────────────────────── */

/**
 * UG renderitza la llista de cançons amb la mateixa estructura repetida per
 * fila dins la pàgina d'artista. No fa servir el `data-content` JSON dels
 * tabs (això només existeix a les pàgines de cançó). Treballem directament
 * sobre el DOM renderitzat:
 *
 *   <div class="oRSaY">                                  ← fila
 *     <div class="_3K1S2 nMn5B uCNwS">
 *       <header class="qyP4i">
 *         <a href="https://…/tab/…-chords-XXXXXX">Títol</a>
 *       </header>
 *     </div>
 *     <div class="_3K1S2 _8jkCW">…<div class="XivAI">25.422</div>…</div>  ← vots
 *     <div class="_3K1S2 UIehk">21.865.293</div>                          ← visites
 *     <div class="_3K1S2 okCUx">Acordes</div>                             ← tipus
 *   </div>
 *
 * La pàgina ja arriba ordenada per visites (sort=hits) i amb 100 files. Per
 * cada títol normalitzat conservem la fila amb més vots. Les classes són
 * generades per build i poden canviar; per resilència, fem servir selectors
 * estructurals (a[href*="/tab/"][href*="-chords-"]) en lloc dels noms exactes.
 *
 * Cloudflare ens bloqueja amb un challenge si fem un fetch normal, així que
 * passem per puppeteerFetch (igual que les pàgines de cançó).
 */
async function scrapeUltimateGuitar(
  url: URL,
  limit: number,
): Promise<ScrapeResult> {
  // Construim la URL amb els filtres correctes (no toquem el host original
  // per preservar variants regionals com es.ultimate-guitar.com).
  const target = new URL(url.toString())
  target.searchParams.set("filter", "chords")
  target.searchParams.set("sort", "hits")

  const { puppeteerFetch } = await import("@/lib/importers/puppeteerFetch")
  const html = await puppeteerFetch(target.toString(), {
    waitForSelector: 'a[href*="/tab/"][href*="-chords-"]',
    settleMs: 1500,
    timeoutMs: 60_000,
  })

  const root = parse(html)

  // Nom de l'artista des del <title>: "Bruno Mars: Acordes de visitas en …"
  const titleTag = root.querySelector("title")?.text ?? ""
  const artist = parseUgArtistName(titleTag)
  if (!artist) {
    throw new Error("No s'ha pogut detectar el nom de l'artista a la pàgina.")
  }

  // Recorrem totes les files. Detectem una fila com qualsevol element que
  // contingui un <a> cap a "/tab/…-chords-…". Així ens estalviem dependre
  // de les classes generades.
  const anchors = root.querySelectorAll('a[href*="/tab/"][href*="-chords-"]')
  if (anchors.length === 0) {
    throw new Error(
      "No s'ha trobat cap llistat de cançons. UG potser ha bloquejat la petició.",
    )
  }

  // best per títol normalitzat: si en trobem dues amb el mateix títol, ens
  // quedem amb la de més vots.
  interface Candidate {
    url: string
    title: string
    votes: number
    order: number
  }
  const best = new Map<string, Candidate>()

  for (let idx = 0; idx < anchors.length; idx++) {
    const a = anchors[idx]
    const href = a.getAttribute("href") ?? ""
    if (!href) continue
    const rawTitle = decodeText(a.text).trim()
    if (!rawTitle) continue
    // El títol de UG pot acabar amb "(versión 3)" / "(version 2)" /
    // "(ver 5)" segons l'idioma — ho traiem per al CSV final.
    const title = rawTitle
      .replace(/\s*\(\s*(?:version|versión|versio|versão|ver|v)\s*\d+\s*\)\s*$/i, "")
      .trim()
    if (!title) continue

    // Pugem per l'arbre fins a una fila que també contingui un node de vots.
    // Limitem la profunditat per no escalar a tot el document.
    let row = a.parentNode
    let depth = 0
    let votes = 0
    while (row && depth < 8) {
      const voteNode = row.querySelector?.(".XivAI")
      if (voteNode) {
        votes = parseUgNumber(voteNode.text)
        break
      }
      row = row.parentNode
      depth++
    }

    // Normalitza el títol per dedup. Tot a minúscules, sense accents,
    // espais col·lapsats i sense puntuació al final.
    const key = normalizeTitle(title)
    const prev = best.get(key)
    if (!prev || votes > prev.votes) {
      best.set(key, { url: href, title, votes, order: idx })
    }
  }

  // Ordenem pel primer aparició (preserva l'ordre de visites de UG) i tallem.
  const songs: ScrapedSong[] = [...best.values()]
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map((c) => ({ url: c.url, title: c.title }))

  return { source: "ultimateGuitar", artist, songs }
}

/**
 * Extreu "Bruno Mars" de "Bruno Mars: Acordes de visitas en Ultimate-Guitar".
 * UG fa servir aquest patró en totes les llengües (canvia el text després
 * dels dos punts). Si no hi ha dos punts, retornem el text complet net.
 */
function parseUgArtistName(rawTitle: string): string {
  const t = rawTitle.trim()
  if (!t) return ""
  const colonIdx = t.indexOf(":")
  if (colonIdx === -1) return t
  return t.slice(0, colonIdx).trim()
}

/**
 * UG renderitza els nombres en format localitzat ("25.422" en castellà,
 * "25,422" en anglès). Tots dos signifiquen 25422. Eliminem qualsevol
 * separador no numèric.
 */
function parseUgNumber(s: string): number {
  const digits = s.replace(/[^\d]/g, "")
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * Clau per a deduplicar títols similars (mateixa cançó, versions diferents).
 * UG sufixa les versions repetides amb "(versión N)" / "(version N)" /
 * "(ver N)" en diferents llengües — els eliminem perquè totes les versions
 * de "The Lazy Song" comparteixin la mateixa clau.
 */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(\s*(?:version|versión|versio|versão|ver|v)\s*\d+\s*\)/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
