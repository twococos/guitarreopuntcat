"use client"
/**
 * SyncedSongBody — cos de la cançó que segueix la reproducció.
 *
 * Mateix markup que el cos normal (<sec>/<ch> en un .song-body amb pre-wrap, song.css sense
 * tocar), però pintat des de parse(content) amb atributs per trobar cada línia (`data-b`) i cada
 * acord (`data-b` + `data-ci`, l'índex del span dins el bloc, el mateix que dona syncAnalysis).
 * El ressaltat es fa per DOM directe a cada frame, no amb estat de React:
 *   - `.sync-hl`: franja darrere la línia que sona (lletra i acords), que llisca d'una a l'altra
 *   - `.sync-cursor`: cursor que avança per la lletra. Els punts de pas són l'inici de la línia,
 *     cada acord (la síl·laba on cau, al temps de l'acord) i el final; entre punts, lineal. Si la
 *     línia ocupa més d'una fila, es recorre fila a fila.
 *   - `ch.is-now`: l'acord que sona
 * El scroll segueix la línia (cap al 35 % de la finestra) fins que l'usuari fa scroll a mà.
 * Clicar una línia hi salta.
 */

import { useEffect, useMemo, useRef } from "react"
import { parse } from "@/lib/editor/model"
import { ALL_FLATS, ALL_SHARPS, respellAccidentals, transposeChord } from "@/lib/transpose"
import { indexAt, occurrenceAt } from "@/lib/player/timeline"
import { getT } from "@/lib/i18n"
import { usePlayer, usePlayerActions, usePlayerFrame } from "./PlayerProvider"

const FOLLOW_AT = 0.35

interface Row {
  left: number
  top: number
  width: number
  height: number
}

/** Geometria de la línia que sona (relativa a l'embolcall): files i punts de pas (temps → u). */
interface LineGeometry {
  rows: Row[]
  /** Amplada acumulada abans de cada fila: u = cum[k] + x dins la fila k. */
  cum: number[]
  total: number
  anchors: { t: number; u: number }[]
}

/** Rectangle del primer caràcter de text després de l'acord (o el final del text d'abans). */
function caretOf(line: HTMLElement, ch: Element): { x: number; top: number } | null {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let before: Text | null = null
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.length || n.parentElement?.closest("ch")) continue
    const range = document.createRange()
    if (ch.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) {
      range.setStart(n, 0)
      range.setEnd(n, 1)
      const r = range.getBoundingClientRect()
      return { x: r.left, top: r.top }
    }
    before = n
  }
  if (!before) return null
  const range = document.createRange()
  range.setStart(before, before.data.length - 1)
  range.setEnd(before, before.data.length)
  const r = range.getBoundingClientRect()
  return { x: r.right, top: r.top }
}

function measureLine(
  line: HTMLElement,
  base: DOMRect,
  start: number,
  end: number,
  chords: { t: number; el: Element | null }[],
): LineGeometry | null {
  const rows: Row[] = []
  for (const r of line.getClientRects()) {
    if (r.height <= 0) continue
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.top + base.top - r.top) < 2) {
      const right = Math.max(last.left + last.width, r.right - base.left)
      last.left = Math.min(last.left, r.left - base.left)
      last.width = right - last.left
    } else {
      rows.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height })
    }
  }
  if (!rows.length) return null
  const cum: number[] = []
  let total = 0
  for (const r of rows) {
    cum.push(total)
    total += r.width
  }
  const uOf = (x: number, top: number) => {
    let k = 0
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].top - (top - base.top)) < Math.abs(rows[k].top - (top - base.top))) k = i
    }
    return cum[k] + Math.min(Math.max(x - base.left - rows[k].left, 0), rows[k].width)
  }
  const anchors = [{ t: start, u: 0 }]
  for (const c of chords) {
    const p = c.el ? caretOf(line, c.el) : null
    const prev = anchors[anchors.length - 1]
    if (!p || c.t <= prev.t) continue
    anchors.push({ t: c.t, u: Math.max(uOf(p.x, p.top), prev.u) })
  }
  const last = anchors[anchors.length - 1]
  anchors.push({ t: Math.max(end, last.t + 1), u: Math.max(total, last.u) })
  return { rows, cum, total, anchors }
}

/** Posició del cursor a `now` dins la línia. */
function cursorAt(g: LineGeometry, now: number): Row {
  const a = g.anchors
  let u = a[a.length - 1].u
  if (now <= a[0].t) u = 0
  else {
    for (let i = 1; i < a.length; i++) {
      if (now < a[i].t) {
        u = a[i - 1].u + ((a[i].u - a[i - 1].u) * (now - a[i - 1].t)) / (a[i].t - a[i - 1].t)
        break
      }
    }
  }
  let k = g.rows.length - 1
  while (k > 0 && g.cum[k] > u) k--
  const r = g.rows[k]
  return { left: r.left + Math.min(u - g.cum[k], r.width), top: r.top, width: 2, height: r.height }
}

function buildHtml(content: string, semitones: number, flats: boolean): string {
  const map = flats ? ALL_FLATS : ALL_SHARPS
  return parse(content.replace(/\r/g, ""))
    .blocks.map((block, b) => {
      if (block.kind === "empty") return ""
      if (block.kind === "section") return `<span class="sync-line" data-b="${b}"><sec>${block.name}</sec></span>`
      const inner = block.spans
        .map((span, ci) =>
          span.kind === "text"
            ? span.text
            : `<ch data-b="${b}" data-ci="${ci}"><span class="sync-chip">${respellAccidentals(
                transposeChord(span.chord.trim(), semitones),
                map,
              )}</span></ch>`,
        )
        .join("")
      return `<span class="sync-line" data-b="${b}">${inner}</span>`
    })
    .join("\n")
}

export function SyncedSongBody({
  content,
  semitones,
  flats,
}: {
  content: string
  semitones: number
  flats: boolean
}) {
  const t = getT()
  const html = useMemo(() => buildHtml(content, semitones, flats), [content, semitones, flats])
  const timeline = usePlayer((s) => s.timeline)
  const following = usePlayer((s) => s.following)
  const actions = usePlayerActions()
  const wrapRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const hlRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const followingRef = useRef(following)
  followingRef.current = following

  // Estat del ressaltat (fora de React)
  const view = useRef({ occ: -2, now: null as Element | null, geo: null as LineGeometry | null })

  /** Acords del content de cada ocurrència (punts de pas del cursor). */
  const chordsOfOcc = useMemo(() => {
    const m = new Map<number, { t: number; span: number }[]>()
    for (const c of timeline?.chords ?? []) {
      if (c.source !== "content") continue
      const list = m.get(c.occ) ?? []
      list.push({ t: c.t, span: c.span })
      m.set(c.occ, list)
    }
    return m
  }, [timeline])

  /** Quantes vegades sona cada bloc (per a la marca 2/3 de les repeticions). */
  const repsOfBlock = useMemo(() => {
    const m = new Map<number, number>()
    for (const o of timeline?.occurrences ?? []) m.set(o.block, (m.get(o.block) ?? 0) + 1)
    return m
  }, [timeline])

  // L'HTML ha canviat (to, notació): el ressaltat s'ha de tornar a posar
  useEffect(() => {
    view.current = { occ: -2, now: null, geo: null }
  }, [html])

  /** Col·loca la franja darrere la línia del bloc `b` (lletra + acords de sobre). */
  function placeHighlight(b: number | null, label: string | null) {
    const wrap = wrapRef.current
    const body = bodyRef.current
    const hl = hlRef.current
    if (!wrap || !body || !hl) return null
    const line = b === null ? null : body.querySelector<HTMLElement>(`.sync-line[data-b="${b}"]`)
    if (!line) {
      hl.classList.remove("is-on")
      view.current.geo = null
      return null
    }
    const base = wrap.getBoundingClientRect()
    let top = Infinity
    let bottom = -Infinity
    for (const r of line.getClientRects()) {
      top = Math.min(top, r.top)
      bottom = Math.max(bottom, r.bottom)
    }
    for (const chip of line.querySelectorAll(".sync-chip")) {
      const r = chip.getBoundingClientRect()
      top = Math.min(top, r.top)
    }
    if (!Number.isFinite(top)) return null
    const o = view.current.occ >= 0 ? timeline?.occurrences[view.current.occ] : null
    view.current.geo = o
      ? measureLine(
          line,
          base,
          o.start,
          o.end,
          (chordsOfOcc.get(view.current.occ) ?? []).map((c) => ({
            t: c.t,
            el: line.querySelector(`ch[data-ci="${c.span}"]`),
          })),
        )
      : null
    hl.style.transform = `translateY(${top - base.top - 3}px)`
    hl.style.height = `${bottom - top + 6}px`
    hl.classList.add("is-on")
    if (badgeRef.current) {
      badgeRef.current.textContent = label ?? ""
      badgeRef.current.hidden = !label
    }
    return { top, bottom }
  }

  function follow(rect: { top: number; bottom: number } | null) {
    if (!rect || !followingRef.current) return
    const target = window.innerHeight * FOLLOW_AT
    const delta = rect.top - target
    if (Math.abs(delta) > 24) window.scrollBy({ top: delta, behavior: "smooth" })
  }

  usePlayerFrame((now) => {
    const tl = timeline
    const body = bodyRef.current
    if (!tl || !body) return
    const v = view.current

    // Línia que sona
    const occ = occurrenceAt(tl.occurrences, now)
    if (occ !== v.occ) {
      v.occ = occ
      const o = occ >= 0 ? tl.occurrences[occ] : null
      const total = o ? (repsOfBlock.get(o.block) ?? 1) : 1
      const rect = placeHighlight(o ? o.block : null, o && total > 1 ? t.public.player.volta(o.rep + 1, total) : null)
      follow(rect)
    }

    // Cursor
    const cursor = cursorRef.current
    if (cursor) {
      const g = v.geo
      if (g) {
        const r = cursorAt(g, now)
        cursor.style.transform = `translate(${r.left.toFixed(1)}px, ${r.top.toFixed(1)}px)`
        cursor.style.height = `${r.height}px`
      }
      cursor.classList.toggle("is-on", g !== null)
    }

    // Acord que sona (només els del content tenen lloc a la lletra)
    const ci = indexAt(tl.chords, now)
    const cur = ci >= 0 ? tl.chords[ci] : null
    const o = cur?.label && cur.source === "content" ? tl.occurrences[cur.occ] : null
    const nowEl = o && cur ? body.querySelector(`ch[data-b="${o.block}"][data-ci="${cur.span}"]`) : null
    if (nowEl !== v.now) {
      v.now?.classList.remove("is-now")
      nowEl?.classList.add("is-now")
      v.now = nowEl
    }
  })

  // La mida de lletra o l'amplada canvien la posició de la línia
  useEffect(() => {
    const body = bodyRef.current
    if (!body || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      view.current.occ = -2
    })
    ro.observe(body)
    return () => ro.disconnect()
  }, [])

  // Scroll a mà (roda, dit, tecles de pàgina): es deixa de seguir
  useEffect(() => {
    const stop = () => {
      if (followingRef.current) actions.setFollowing(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) stop()
    }
    window.addEventListener("wheel", stop, { passive: true })
    window.addEventListener("touchmove", stop, { passive: true })
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("wheel", stop)
      window.removeEventListener("touchmove", stop)
      window.removeEventListener("keydown", onKey)
    }
  }, [actions])

  // Tornar a seguir: porta la línia actual a lloc
  useEffect(() => {
    if (following) view.current.occ = -2
  }, [following])

  function onClick(e: React.MouseEvent) {
    const tl = timeline
    if (!tl) return
    if ((e.target as HTMLElement).closest("a, button")) return
    const line = (e.target as HTMLElement).closest<HTMLElement>(".sync-line[data-b]")
    if (!line) return
    const b = Number(line.dataset.b)
    const now = actions.now()
    const occs = tl.occurrences.filter((o) => o.block === b)
    let target = occs.find((o) => o.start >= now - 1500) ?? occs[0]
    // Una secció: el principi de la seva primera línia que encara no ha sonat
    if (!target) {
      const sec = tl.sections.filter((s) => s.block === b)
      const s = sec.find((x) => x.start >= now - 1500) ?? sec[0]
      if (!s) return
      actions.seek(Math.max(s.start - 300, 0))
      return
    }
    actions.seek(Math.max(target.start - 300, 0))
  }

  return (
    <div ref={wrapRef} className="sync-body-wrap" onClick={onClick}>
      <div ref={hlRef} className="sync-hl" aria-hidden="true">
        <span ref={badgeRef} className="sync-hl-badge" hidden />
      </div>
      <div ref={cursorRef} className="sync-cursor" aria-hidden="true" />
      <div
        ref={bodyRef}
        className="song-body sync-body"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
