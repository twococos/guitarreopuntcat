import type { PdfOptions } from "@/lib/schemas/canconer"
import { getT } from "@/lib/i18n"
import type { BookFrame } from "./frame"
import type { ProgressFn } from "./types"

/**
 * Paginador: reparteix el contingut de `#pdf-staging` en pàgines A4 reals
 * dins de l'iframe.
 *
 * A diferència del PDF de servidor (que simulava els salts dividint
 * alçades), aquí cada pàgina és un element de 210×297mm i el contingut
 * s'hi col·loca de debò: el que desborda es mou a la pàgina següent.
 * Per a cada fragment fem UNA sola mesura (afegim totes les unitats
 * pendents i busquem la primera que surt de la pàgina), no una per línia.
 *
 * Unitats atòmiques (mai es parteixen): capçalera de cançó, cada
 * `.pdf-unit` (una línia, o un títol de secció + la línia següent) i
 * cada fila de l'índex.
 */

export type PageKind = "cover" | "toc" | "blank" | "song"

export interface BookPage {
  el: HTMLElement
  content: HTMLElement
  kind: PageKind
}

export interface BookLayout {
  pages: BookPage[]
  /** Pàgina (0-indexed) i element d'inici de cada cançó, per índex 1-based. */
  songStarts: Map<number, { pageIdx: number; el: HTMLElement }>
  /** Índex (0-indexed) de la primera pàgina numerada (primera cançó). */
  firstNumberedIdx: number
}

const LOGO_URL = "/img/Logo.png"
/** Tolerància de mesura (px) per arrodoniments subpíxel. */
const EPS = 0.5

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

class Paginator {
  pages: BookPage[] = []

  constructor(
    private readonly frame: BookFrame,
    private readonly options: PdfOptions,
  ) {}

  newPage(kind: PageKind): BookPage {
    const doc = this.frame.doc
    const el = doc.createElement("div")
    el.className = `pdf-page is-${kind}`
    let content: HTMLElement = el
    if (kind !== "cover") {
      content = doc.createElement("div")
      content.className = "pdf-content"
      el.appendChild(content)
    }
    this.frame.pagesRoot.appendChild(el)
    const page = { el, content, kind }
    this.pages.push(page)
    return page
  }

  contentBottom(page: BookPage): number {
    return page.content.getBoundingClientRect().bottom
  }

  /** Primer element de `items` que surt de l'àrea útil, o -1. */
  firstOverflow(items: HTMLElement[], page: BookPage, colsBox: HTMLElement | null): number {
    const bottom = this.contentBottom(page)
    const right = colsBox ? colsBox.getBoundingClientRect().right : Infinity
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (r.height === 0 && r.width === 0) continue // unitats amagades
      if (r.bottom > bottom + EPS || r.left >= right - EPS) return i
    }
    return -1
  }

  /* ── Índex ─────────────────────────────────────────────── */

  layoutToc(toc: HTMLElement): void {
    let page = this.newPage("toc")
    page.content.appendChild(toc)
    let rows = Array.from(toc.querySelectorAll<HTMLElement>("tbody > tr"))
    for (;;) {
      let k = this.firstOverflow(rows, page, null)
      if (k === -1) return
      if (k === 0) k = 1 // una fila més alta que la pàgina: la forcem
      if (k >= rows.length) return
      const rest = rows.slice(k)
      page = this.newPage("toc")
      const cont = this.frame.doc.createElement("div")
      cont.className = "toc is-cont"
      cont.innerHTML = "<table><tbody></tbody></table>"
      const tbody = cont.querySelector("tbody")
      if (!tbody) return
      for (const r of rest) tbody.appendChild(r)
      page.content.appendChild(cont)
      rows = rest
    }
  }

  /* ── Cançons ───────────────────────────────────────────── */

  /** Fixa el mode de columnes d'un fragment de cos. */
  private setFill(body: HTMLElement, page: BookPage): void {
    if (this.options.columns <= 1) return
    const top = body.getBoundingClientRect().top
    body.classList.add("is-fill")
    body.style.height = `${Math.max(0, this.contentBottom(page) - top)}px`
  }

  private setBalanced(body: HTMLElement): void {
    if (this.options.columns <= 1) return
    body.classList.remove("is-fill")
    body.style.height = ""
  }

  /** Amaga les línies en blanc a l'inici d'un fragment de continuació. */
  private dropLeadingBlanks(units: HTMLElement[]): void {
    for (const u of units) {
      if (!u.classList.contains("pdf-unit-blank")) break
      u.classList.add("is-dropped")
    }
  }

  /**
   * Col·loca una cançó començant a `page`. Retorna la pàgina on acaba.
   * `isPageStart` indica si la cançó és el primer que hi ha a la pàgina.
   */
  layoutSong(section: HTMLElement, startPage: BookPage, isPageStart: boolean): { end: BookPage; start: BookPage } {
    const doc = this.frame.doc
    let page = startPage
    let start = startPage
    let fragment = section
    let body = section.querySelector<HTMLElement>(".song-body")
    if (!body) return { end: page, start }
    let units = Array.from(body.children) as HTMLElement[]
    let firstFragment = true
    let pageStart = isPageStart

    for (;;) {
      this.setFill(body, page)
      const head = firstFragment ? fragment.querySelector<HTMLElement>(".song-head-wrap") : null
      const headOverflows = head ? this.firstOverflow([head], page, null) === 0 : false
      let k = headOverflows ? 0 : this.firstOverflow(units, page, this.options.columns > 1 ? body : null)

      if (k === -1) {
        this.setBalanced(body)
        return { end: page, start }
      }

      if (k === 0 && firstFragment && !pageStart) {
        // Ni la capçalera ni la primera unitat hi caben: tota la cançó a
        // pàgina nova (mai una capçalera sola a final de pàgina).
        page = this.newPage("song")
        start = page
        fragment.classList.remove("flow-next")
        page.content.appendChild(fragment)
        pageStart = true
        continue
      }
      if (k === 0) k = 1 // unitat més alta que una pàgina sencera
      if (k >= units.length) {
        this.setBalanced(body)
        return { end: page, start }
      }

      // Partim: les unitats [k..] passen a un fragment de continuació.
      const rest = units.slice(k)
      page = this.newPage("song")
      const cont = doc.createElement("section")
      cont.className = "song-page is-cont"
      const article = fragment.querySelector<HTMLElement>("article.song")
      const contArticle = doc.createElement("article")
      contArticle.className = "song"
      if (article) {
        contArticle.dataset.style = article.dataset.style ?? ""
        const inline = article.getAttribute("style")
        if (inline) contArticle.setAttribute("style", inline)
      }
      const contBody = doc.createElement("div")
      contBody.className = "song-body"
      for (const u of rest) contBody.appendChild(u)
      contArticle.appendChild(contBody)
      cont.appendChild(contArticle)
      page.content.appendChild(cont)
      this.dropLeadingBlanks(rest)

      fragment = cont
      body = contBody
      units = rest
      firstFragment = false
      pageStart = true
    }
  }

  /* ── Capçaleres, peus i números ───────────────────────── */

  decorate(title: string, firstNumberedIdx: number): void {
    const doc = this.frame.doc
    const t = getT()
    const book = this.options.book_format
    for (let i = firstNumberedIdx; i < this.pages.length; i++) {
      const page = this.pages[i]
      if (page.kind !== "song") continue
      const num = i - firstNumberedIdx + 1
      const odd = num % 2 === 1
      const header = doc.createElement("div")
      header.className = `pdf-header${book && !odd ? " is-mirror" : ""}`
      header.innerHTML =
        `<span class="pdf-h-title">${escHtml(title)}</span>` +
        `<span class="pdf-h-brand"><span>${escHtml(t.common.pdfDocument.marca)}</span>` +
        `<img src="${LOGO_URL}" alt=""></span>`
      const footer = doc.createElement("div")
      footer.className = `pdf-footer${book ? (odd ? " is-odd" : " is-even") : ""}`
      footer.innerHTML = `<span class="pdf-f-num">${num}</span>`
      page.el.appendChild(header)
      page.el.appendChild(footer)
    }
  }
}

async function waitImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"))
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            img.addEventListener("load", () => r(), { once: true })
            img.addEventListener("error", () => r(), { once: true })
          }),
    ),
  )
}

export async function paginate(
  frame: BookFrame,
  options: PdfOptions,
  title: string,
  onProgress?: ProgressFn,
): Promise<BookLayout> {
  const p = new Paginator(frame, options)
  const staging = frame.staging

  // ── Portada ──
  const cover = staging.querySelector<HTMLElement>(":scope > .cover")
  if (cover) p.newPage("cover").content.appendChild(cover)

  // ── Índex ──
  const toc = staging.querySelector<HTMLElement>(":scope > .toc")
  if (toc) p.layoutToc(toc)

  // ── Mode llibre: la primera cançó ha de caure en pàgina física senar
  // (dreta en impressió a doble cara). Comptem portada + índex.
  if (options.book_format && p.pages.length % 2 === 1) p.newPage("blank")

  // ── Cançons ──
  const sections = Array.from(staging.querySelectorAll<HTMLElement>(":scope > section.song-page"))
  const songStarts = new Map<number, { pageIdx: number; el: HTMLElement }>()
  let page: BookPage | null = null
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const isPageStart = page === null || options.page_breaks
    if (isPageStart) page = p.newPage("song")
    else section.classList.add("flow-next")
    if (!page) break
    page.content.appendChild(section)
    const { start, end } = p.layoutSong(section, page, isPageStart)
    songStarts.set(Number(section.dataset.songIdx), { pageIdx: p.pages.indexOf(start), el: section })
    page = end
    onProgress?.(((i + 1) / sections.length) * 100)
    if (i % 5 === 4) await nextFrame()
  }

  const firstSong = songStarts.get(1)
  const firstNumberedIdx = firstSong ? firstSong.pageIdx : p.pages.length
  p.decorate(title, firstNumberedIdx)

  // ── Números de pàgina a l'índex (enllaçats a la cançó) ──
  frame.doc.querySelectorAll<HTMLElement>(".toc tr[data-song-idx]").forEach((tr) => {
    const idx = Number(tr.dataset.songIdx)
    const s = songStarts.get(idx)
    const link = tr.querySelector<HTMLElement>(".toc-page a")
    if (!s || !link) return
    link.textContent = String(s.pageIdx - firstNumberedIdx + 1)
  })

  await waitImages(frame.pagesRoot)
  return { pages: p.pages, songStarts, firstNumberedIdx }
}
