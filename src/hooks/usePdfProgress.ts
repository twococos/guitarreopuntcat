"use client"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Progrés de la generació d'un PDF (al navegador, src/lib/pdf-client).
 *
 * El generador reporta el progrés real amb `report(pct)`. La barra:
 *   · Mai va enrere.
 *   · Queda limitada a un SOSTRE (~92%) fins que arriba `finish()`: l'última
 *     part (desar el fitxer) no és reportable i no ha de semblar encallada
 *     al 100%.
 *   · Amb `finish()`, accelera ràpidament fins al 100% i tanca l'overlay.
 *
 * Els missatges de conya van rotant en ordre aleatori (sense repetir fins
 * esgotar la llista).
 */

/** Sostre que la barra no supera fins a finish(). */
const CEILING = 92
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
  /** Obre l'overlay a 0% amb la llista de missatges. */
  start: (messages: readonly string[]) => void
  /** Progrés real (0..100) reportat pel generador. */
  report: (pct: number) => void
  /** Accelera fins a 100% i tanca l'overlay. Resol quan s'ha tancat. */
  finish: () => Promise<void>
  /** Tanca l'overlay immediatament (cas d'error). */
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

  const rafRef = useRef<number | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesRef = useRef<string[]>([])
  const msgIdxRef = useRef(0)
  /** Últim percentatge mostrat (per a finish() i per no anar mai enrere). */
  const pctRef = useRef(0)

  const showPct = useCallback((v: number) => {
    pctRef.current = v
    setPct(v)
  }, [])

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
    (messages: readonly string[]) => {
      cancelTimers()
      messagesRef.current = shuffled(messages)
      msgIdxRef.current = 0
      setActive(true)
      showPct(0)
      nextMessage()
      msgTimerRef.current = setInterval(nextMessage, MESSAGE_INTERVAL_MS)
    },
    [cancelTimers, nextMessage, showPct],
  )

  const report = useCallback(
    (value: number) => {
      const capped = Math.min(CEILING, Math.max(pctRef.current, value))
      if (capped !== pctRef.current) showPct(capped)
    },
    [showPct],
  )

  const finish = useCallback((): Promise<void> => {
    cancelTimers()
    return new Promise<void>((resolve) => {
      const startPct = pctRef.current
      const finishStart = performance.now()
      const tick = () => {
        const t = Math.min(1, (performance.now() - finishStart) / FINISH_MS)
        showPct(startPct + (100 - startPct) * t)
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
  }, [cancelTimers, showPct])

  const fail = useCallback(() => {
    cancelTimers()
    setActive(false)
    showPct(0)
  }, [cancelTimers, showPct])

  // Neteja en desmuntar.
  useEffect(() => cancelTimers, [cancelTimers])

  return { active, pct, message, start, report, finish, fail }
}
