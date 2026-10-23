"use client"
/**
 * Peces del reproductor que comparteixen el panell (escriptori) i la franja (pantalles estretes):
 * l'acord que sona amb la tira de compassos que vénen, xips de secció, selector de mode i ajustos
 * (ritme, mescla, velocitat). Les que depenen de la posició l'escriuen al DOM a cada frame.
 */

import { useId, useMemo, useRef } from "react"
import { useSession } from "next-auth/react"
import { parse } from "@/lib/editor/model"
import { getT } from "@/lib/i18n"
import { ALL_FLATS, ALL_SHARPS, respellAccidentals, transposeChord } from "@/lib/transpose"
import type { Mix } from "@/lib/player/controller"
import { RATE_RANGE } from "@/lib/player/options"
import { STYLE_IDS, type StyleId } from "@/lib/player/styles"
import { indexAt } from "@/lib/player/timeline"
import { usePlayer, usePlayerActions, usePlayerFrame, usePlayerView } from "./PlayerProvider"
import { IconPause, IconPlay } from "@/components/shared/Icons"

/** Nom de cada bloc <sec> del content que es veu (amb arranjament ràpid, l'arranjat). */
function useSectionNames(): Map<number, string> {
  const { displayContent } = usePlayerView()
  return useMemo(() => {
    const m = new Map<number, string>()
    parse(displayContent.replace(/\r/g, "")).blocks.forEach((b, i) => {
      if (b.kind === "section") m.set(i, b.name.replace(/<[^>]*>/g, "").trim())
    })
    return m
  }, [displayContent])
}

/** Acord que es veu (transposat i amb la notació triada). */
function useShowChord(): (label: string | null) => string {
  const { semitones, flats } = usePlayerView()
  return (label) =>
    label ? respellAccidentals(transposeChord(label, semitones), flats ? ALL_FLATS : ALL_SHARPS) : "—"
}

/** Compassos que caben a la tira (cada compàs vol ~80 px). */
const LANE_PX_PER_BAR = 80

interface LaneColors {
  accent: string
  text: string
  muted: string
  border: string
  bg: string
  font: string
}

function laneColors(el: HTMLElement): LaneColors {
  const cs = getComputedStyle(el)
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d
  return {
    accent: v("--accent", "#c0392b"),
    text: v("--text", "#222"),
    muted: v("--muted", "#888"),
    border: v("--border", "#e5e5e5"),
    bg: v("--lane-bg", "#fff"),
    font: v("--song-body-font", cs.fontFamily),
  }
}

/**
 * Tira de compassos que vénen (com la línia de temps del visor del transcriptor): el capçal a
 * l'esquerra, enganxat a l'acord que sona, i a la dreta els acords com a caixes on toquen, les
 * línies de compàs amb el número i els temps a sota. L'eix és el temps real: on els temps
 * s'acceleren, surten més junts. El que ja ha passat no es veu. Es pinta en un canvas a cada
 * frame; clicar-hi salta a aquell punt.
 */
function ChordLane({ compact }: { compact: boolean }) {
  const timeline = usePlayer((s) => s.timeline)
  const actions = usePlayerActions()
  const show = useShowChord()
  const ref = useRef<HTMLCanvasElement>(null)
  const colors = useRef<LaneColors | null>(null)
  const view = useRef({ t0: 0, span: 1 })

  usePlayerFrame((now) => {
    const tl = timeline
    const cv = ref.current
    if (!tl || !cv) return
    const W = cv.clientWidth
    const H = cv.clientHeight
    if (!W || !H) return
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      colors.current = null
    }
    const c = (colors.current ??= laneColors(cv))
    const g = cv.getContext("2d")
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)

    const span = Math.max(W / LANE_PX_PER_BAR, 1.5) * tl.barMs
    const t0 = now
    const t1 = t0 + span
    view.current = { t0, span }
    const x = (t: number) => ((t - t0) / span) * W
    const tickH = compact ? 5 : 7
    const boxH = H - tickH - 4

    // Acords
    g.font = `700 ${compact ? 13 : 15}px ${c.font}`
    g.textBaseline = "middle"
    const ci = indexAt(tl.chords, now)
    for (let i = Math.max(indexAt(tl.chords, t0), 0); i < tl.chords.length && tl.chords[i].t <= t1; i++) {
      const ch = tl.chords[i]
      if (!ch.label) continue
      const end = i + 1 < tl.chords.length ? tl.chords[i + 1].t : tl.duration
      const xa = Math.max(x(ch.t), 0)
      const xb = Math.min(x(end), W + 4)
      if (xb - xa < 2) continue
      const on = i === ci
      g.fillStyle = on ? c.accent : c.bg
      g.strokeStyle = on ? c.accent : c.border
      g.lineWidth = 1
      g.beginPath()
      g.roundRect(xa + 1.5, 1.5, xb - xa - 3, boxH, 5)
      g.fill()
      g.stroke()
      g.save()
      g.beginPath()
      g.rect(xa + 2, 0, Math.max(xb - xa - 6, 0), boxH)
      g.clip()
      g.fillStyle = on ? "#fff" : c.text
      g.fillText(show(ch.label), xa + 7, 1.5 + boxH / 2)
      g.restore()
    }

    // Línies de compàs (amb el número) i temps
    g.font = "600 9px system-ui, sans-serif"
    g.textBaseline = "bottom"
    g.strokeStyle = c.muted
    g.fillStyle = c.muted
    g.lineWidth = 1
    for (let i = indexAt(tl.pulses, t0) + 1; i < tl.pulses.length && tl.pulses[i].t <= t1; i++) {
      const p = tl.pulses[i]
      const xp = Math.round(x(p.t)) + 0.5
      const bar = p.inBar === 0
      g.globalAlpha = bar ? 0.6 : 0.45
      g.beginPath()
      g.moveTo(xp, bar ? 0 : H - tickH)
      g.lineTo(xp, H)
      g.stroke()
      if (bar && !compact && p.bar > 0) {
        g.globalAlpha = 0.9
        g.fillText(String(p.bar), xp + 3, H + 1)
      }
    }
    g.globalAlpha = 1

    // Capçal
    g.fillStyle = c.text
    g.fillRect(0, 0, 2, H)
  })

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const { t0, span } = view.current
    actions.seek(Math.max(t0 + ((e.clientX - r.left) / r.width) * span, 0))
  }

  return <canvas ref={ref} className="player-lane" onClick={onClick} aria-hidden="true" />
}

export function NowPlaying({ compact = false }: { compact?: boolean }) {
  const tp = getT().public.player
  const timeline = usePlayer((s) => s.timeline)
  const show = useShowChord()
  const names = useSectionNames()
  const nowRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const dotsRef = useRef<HTMLSpanElement>(null)
  const last = useRef({ now: "", bar: "", dots: -1, beat: -1 })

  usePlayerFrame((now) => {
    const tl = timeline
    if (!tl) return
    const L = last.current
    const ci = indexAt(tl.chords, now)
    const nowTxt = show(ci >= 0 ? tl.chords[ci].label : null)
    if (nowRef.current && nowTxt !== L.now) nowRef.current.textContent = L.now = nowTxt

    // Compàs i temps
    const pi = indexAt(tl.pulses, now)
    const p = pi >= 0 ? tl.pulses[pi] : null
    const si = indexAt(tl.sections.map((s) => ({ t: s.start })), now)
    const sec = si >= 0 && now <= tl.sections[si].end + 1500 ? tl.sections[si] : null
    const barTxt = p ? `${tp.compas(p.bar)}${sec ? ` · ${names.get(sec.block) ?? ""}` : ""}` : ""
    if (barRef.current && barTxt !== L.bar) barRef.current.textContent = L.bar = barTxt
    const dots = dotsRef.current
    if (dots && p) {
      if (L.dots !== p.perBar) {
        dots.replaceChildren(...Array.from({ length: Math.min(p.perBar, 12) }, () => document.createElement("i")))
        L.dots = p.perBar
        L.beat = -1
      }
      if (L.beat !== p.inBar) {
        dots.childNodes.forEach((d, k) => (d as HTMLElement).classList.toggle("is-on", k === p.inBar))
        L.beat = p.inBar
      }
    }
  })

  return (
    <div className={`player-now${compact ? " is-compact" : ""}`}>
      <span ref={nowRef} className="player-chord-now" title={tp.acordAra}>
        —
      </span>
      <ChordLane compact={compact} />
      {!compact && (
        <div className="player-now-bar">
          <span ref={dotsRef} className="player-dots" aria-hidden="true" />
          <span ref={barRef} className="player-bar-label" />
        </div>
      )}
    </div>
  )
}

export function SectionChips({ compact = false }: { compact?: boolean }) {
  const timeline = usePlayer((s) => s.timeline)
  const actions = usePlayerActions()
  const names = useSectionNames()
  const listRef = useRef<HTMLDivElement>(null)
  const current = useRef(-2)

  usePlayerFrame((now) => {
    const tl = timeline
    const list = listRef.current
    if (!tl || !list) return
    const i = indexAt(tl.sections.map((s) => ({ t: s.start })), now)
    if (i === current.current) return
    current.current = i
    list.querySelectorAll<HTMLElement>("[data-si]").forEach((el) => {
      const on = Number(el.dataset.si) === i
      el.classList.toggle("is-on", on)
      if (on && compact) el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
    })
  })

  if (!timeline || timeline.sections.length === 0) return null
  return (
    <div ref={listRef} className={`player-sections${compact ? " is-compact" : ""}`} role="list">
      {timeline.sections.map((s, i) => (
        <button
          key={`${s.block}-${s.rep}-${s.start}`}
          type="button"
          role="listitem"
          className="player-section-chip"
          data-si={i}
          onClick={() => actions.seek(s.start)}
        >
          {names.get(s.block) ?? "?"}
        </button>
      ))}
    </div>
  )
}

export function ModeSwitch() {
  const tp = getT().public.player
  const mode = usePlayer((s) => s.mode)
  const videoOk = usePlayer((s) => s.videoOk)
  const actions = usePlayerActions()
  if (!videoOk) return null
  return (
    <div className="player-mode" role="radiogroup" aria-label={tp.modeAria}>
      {(["video", "solo"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={`player-mode-btn${mode === m ? " is-active" : ""}`}
          onClick={() => actions.setMode(m)}
          title={m === "video" ? tp.modeVideoHint : tp.modeSoloHint}
        >
          {m === "video" ? tp.modeVideo : tp.modeSolo}
        </button>
      ))}
    </div>
  )
}

const MIX_TRACKS: (keyof Mix)[] = ["guitar", "bass", "perc", "click"]

/** Ajustos: en mode vídeo només la velocitat; en mode sol, també el ritme i la mescla. */
export function PlayerSettings() {
  const tp = getT().public.player
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"
  const mode = usePlayer((s) => s.mode)
  const style = usePlayer((s) => s.style)
  const styleSource = usePlayer((s) => s.styleSource)
  const detected = usePlayer((s) => s.detected)
  const fixedStyle = usePlayer((s) => s.fixedStyle)
  const mix = usePlayer((s) => s.mix)
  const rate = usePlayer((s) => s.rate)
  const marksId = useId()
  const ready = usePlayer((s) => s.status === "ready")
  const actions = usePlayerActions()
  const { semitones } = usePlayerView()

  return (
    <div className="player-settings">
      {mode === "video" && semitones !== 0 && <p className="player-hint">{tp.transposatVideo}</p>}

      {mode === "solo" && (
        <>
          <label className="player-field">
            <span className="player-field-label">
              {tp.ritme} <span className="player-field-note">· {tp.ritmeFont[styleSource]}</span>
            </span>
            <select
              className="player-select"
              value={style}
              disabled={!ready}
              onChange={(e) => actions.setStyle(e.target.value as StyleId)}
            >
              {STYLE_IDS.map((id) => (
                <option key={id} value={id}>
                  {tp.estils[id]}
                </option>
              ))}
            </select>
          </label>
          {detected && styleSource !== "detected" && (
            <p className="player-hint">
              {tp.ritmeDetectat(tp.estils[detected.style], Math.round(detected.confidence * 100))}
            </p>
          )}
          {isAdmin && ready && (
            <div className="player-admin-row">
              {style !== fixedStyle && (
                <button type="button" className="player-link-btn" onClick={() => void actions.fixStyle(style)}>
                  {tp.fixaRitme}
                </button>
              )}
              {fixedStyle && (
                <button type="button" className="player-link-btn" onClick={() => void actions.fixStyle(null)}>
                  {tp.treuRitmeFixat}
                </button>
              )}
            </div>
          )}

          <fieldset className="player-mix">
            <legend className="player-field-label">{tp.mescla}</legend>
            {MIX_TRACKS.map((k) => (
              <label key={k} className="player-slider">
                <span>{tp.volum[k]}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={mix[k]}
                  disabled={!ready}
                  onChange={(e) => actions.setMix({ [k]: Number(e.target.value) })}
                />
              </label>
            ))}
          </fieldset>
        </>
      )}

      <label className="player-field">
        <span className="player-field-label">
          {tp.velocitat} <span className="player-rate-value">{tp.percent(Math.round(rate * 100))}</span>
        </span>
        <input
          type="range"
          className="player-rate"
          min={RATE_RANGE.min}
          max={RATE_RANGE.max}
          step={RATE_RANGE.step}
          value={rate}
          list={marksId}
          disabled={!ready}
          title={tp.velocitatHint}
          onChange={(e) => actions.setRate(Number(e.target.value))}
          onDoubleClick={() => actions.setRate(1)}
        />
        <datalist id={marksId}>
          <option value={1} />
        </datalist>
      </label>
    </div>
  )
}

/**
 * Reproductor plegat (columna del visor de cançoners): l'acord que sona i el que ve, la secció
 * i play/pausa. És el mínim per tocar-hi sense mirar el panell.
 */
export function PlayerMini() {
  const tp = getT().public.player
  const timeline = usePlayer((s) => s.timeline)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.status === "loading")
  const actions = usePlayerActions()
  const show = useShowChord()
  const names = useSectionNames()
  const nowRef = useRef<HTMLSpanElement>(null)
  const nextRef = useRef<HTMLSpanElement>(null)
  const secRef = useRef<HTMLSpanElement>(null)
  const last = useRef({ now: "", next: "", sec: "" })

  usePlayerFrame((now) => {
    const tl = timeline
    if (!tl) return
    const L = last.current
    const ci = indexAt(tl.chords, now)
    const cur = ci >= 0 ? tl.chords[ci].label : null
    const nowTxt = show(cur)
    let nextTxt = ""
    for (let k = ci + 1; k < tl.chords.length; k++) {
      const l = tl.chords[k].label
      if (l && l !== cur) {
        nextTxt = show(l)
        break
      }
    }
    const si = indexAt(tl.sections.map((s) => ({ t: s.start })), now)
    const secTxt = si >= 0 && now <= tl.sections[si].end + 1500 ? (names.get(tl.sections[si].block) ?? "") : ""
    if (nowRef.current && nowTxt !== L.now) nowRef.current.textContent = L.now = nowTxt
    if (nextRef.current && nextTxt !== L.next) nextRef.current.textContent = L.next = nextTxt
    if (secRef.current && secTxt !== L.sec) secRef.current.textContent = L.sec = secTxt
  })

  return (
    <div className="player-mini">
      <button
        type="button"
        className={`player-mini-play${playing ? " is-playing" : ""}`}
        onClick={actions.toggle}
        disabled={loading}
        aria-label={playing ? tp.pausa : tp.play}
        title={playing ? tp.pausa : tp.play}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <span ref={nowRef} className="player-chord-now player-mini-now" title={tp.acordAra}>
        —
      </span>
      <span className="player-mini-next" title={tp.seguent}>
        <small>{tp.seguent}</small>
        <span ref={nextRef} />
      </span>
      <span ref={secRef} className="player-mini-sec" />
    </div>
  )
}
