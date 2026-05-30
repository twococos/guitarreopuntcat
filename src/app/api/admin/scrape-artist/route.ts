/**
 * Generador de CSV (admin): donat un link a una pàgina d'artista d'una web
 * suportada, descarrega la pàgina i extreu el llistat de cançons (amb àlbum
 * i any si es detecta) per ajudar a construir el CSV d'importació massiva.
 *
 * Suport actual: www.acordscatala.cat amb URLs del tipus
 *   https://www.acordscatala.cat/ca/{slug-artista}
 *
 * Resposta:
 *   { artist: string, songs: Array<{ url, title, album?, year? }> }
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
})

interface ScrapedSong {
  url: string
  title: string
  album?: string
  year?: number
}

interface ScrapeResult {
  source: "acordscatala"
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
          "Web no suportada. Actualment només: acordscatala.cat/ca/{artista}",
      },
      { status: 400 },
    )
  }

  try {
    const html = await defaultFetch(u.toString())
    const result = scraper(html, u)
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

type Scraper = (html: string, url: URL) => ScrapeResult

function pickScraper(u: URL): Scraper | null {
  const host = u.hostname.toLowerCase()
  if (host === "www.acordscatala.cat" || host === "acordscatala.cat") {
    // Path esperat: /ca/{slug}  (un sol segment després de /ca/)
    const segments = u.pathname.split("/").filter(Boolean)
    if (segments.length === 2 && segments[0] === "ca") {
      return scrapeAcordsCatala
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
