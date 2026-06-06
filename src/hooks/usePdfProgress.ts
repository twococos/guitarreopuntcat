"use client"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Progrés SIMULAT de la generació d'un PDF.
 *
 * La generació real és una sola petició HTTP bloquejant sense fases
 * reportables, i amb cançoners llargs no es pot estimar bé quant trigarà
 * Puppeteer. Per això la barra:
 *
 *   · Puja amb una corba asimptòtica que s'apropa a un SOSTRE (~92%) però
 *     no hi arriba mai sola — així cap cançoner llarg "es planta" al 100%.
 *   · La corba escala amb el nombre de cançons: més cançons → s'apropa al
 *     sostre més lentament.
 *   · Quan arriba la resposta (`finish()`), accelera ràpidament fins al 100%
 *     i tanca l'overlay.
 *
 * Els missatges de conya van rotant en ordre aleatori (sense repetir fins
 * esgotar la llista).
 */

/** Sostre que la corba simulada no supera mentre s'espera la resposta. */
const CEILING = 92
/** A la durada de referència s'arriba a aquesta fracció del sostre. */
const REFERENCE_FRACTION = 0.85
/** Durada de referència: base + per cançó (ms). */
const BASE_MS = 2000
const PER_SONG_MS = 1200
/** Cadència de rotació dels missatges (ms). */
const MESSAGE_INTERVAL_MS = 1800
/** Durada de l'acceleració final fins a 100% (ms). */
const FINISH_MS = 450

export interface PdfProgress {
  /** Si l'overlay s'ha de mostrar. */
  active: boolean
  /** Percentatge actual (0..100). */
  pct: number
  /** Missatge de conya actual. */
  message: string
  /** Engega la simulació per a `songCount` cançons amb la llista de missatges. */
  start: (songCount: number, messages: readonly string[]) => void
  /** Accelera fins a 100% i tanca l'overlay. Resol quan s'ha tancat. */
  finish: () => Promise<void>
  /** Atura la simulació i tanca l'overlay immediatament (cas d'error). */
  fail: () => void
}

/** Barreja una còpia de l'array (Fisher–Yates). */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function usePdfProgress(): PdfProgress {
  const [active, setActive] = useState(false)
  const [pct, setPct] = useState(0)
  const [message, setMessage] = useState("")

  // Refs per als temporitzadors i l'estat intern de la simulació, perquè els
  // callbacks no es recreïn i puguem netejar de forma fiable.
  const rafRef = useRef<number | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)
  const tauRef = useRef(1)
  const messagesRef = useRef<string[]>([])
  const msgIdxRef = useRef(0)

  const cancelTimers = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (msgTimerRef.current !== null) {
      clearInterval(msgTimerRef.current)
      msgTimerRef.current = null
    }
  }, [])

  const nextMessage = useCallback(() => {
    const list = messagesRef.current
    if (list.length === 0) return
    if (msgIdxRef.current >= list.length) {
      // Esgotada: tornem a barrejar per no repetir l'ordre.
      messagesRef.current = shuffled(list)
      msgIdxRef.current = 0
    }
    setMessage(messagesRef.current[msgIdxRef.current])
    msgIdxRef.current += 1
  }, [])

  const start = useCallback(
    (songCount: number, messages: readonly string[]) => {
      cancelTimers()

      // Durada de referència segons el nombre de cançons.
      const referenceMs = BASE_MS + PER_SONG_MS * Math.max(1, songCount)
      // pct(t) = CEILING · (1 - e^(-t/τ)); volem pct(referenceMs) =
      // CEILING · REFERENCE_FRACTION ⇒ τ = referenceMs / ln(1/(1-frac)).
      tauRef.current = referenceMs / Math.log(1 / (1 - REFERENCE_FRACTION))

      messagesRef.current = shuffled(messages)
      msgIdxRef.current = 0
      startedAtRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now()

      setActive(true)
      setPct(0)
      nextMessage()

      const tick = () => {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const elapsed = now - startedAtRef.current
        const value = CEILING * (1 - Math.exp(-elapsed / tauRef.current))
        setPct(value)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      msgTimerRef.current = setInterval(nextMessage, MESSAGE_INTERVAL_MS)
    },
    [cancelTimers, nextMessage],
  )

  const finish = useCallback((): Promise<void> => {
    cancelTimers()
    return new Promise<void>((resolve) => {
      const startPct = (() => {
        // Llegim el valor actual de la corba al moment de finalitzar.
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const elapsed = now - startedAtRef.current
        return CEILING * (1 - Math.exp(-elapsed / tauRef.current))
      })()
      const finishStart =
        typeof performance !== "undefined" ? performance.now() : Date.now()

      const tick = () => {
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const t = Math.min(1, (now - finishStart) / FINISH_MS)
        setPct(startPct + (100 - startPct) * t)
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          rafRef.current = null
          setActive(false)
          resolve()
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    })
  }, [cancelTimers])

  const fail = useCallback(() => {
    cancelTimers()
    setActive(false)
    setPct(0)
  }, [cancelTimers])

  // Neteja en desmuntar.
  useEffect(() => cancelTimers, [cancelTimers])

  return { active, pct, message, start, finish, fail }
}
