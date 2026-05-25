"use client"
import { useCallback, useRef, useState } from "react"

/**
 * Historial d'undo/redo controlat manualment.
 *
 * - `value` és l'estat actual.
 * - `setValue` substitueix el valor SENSE empilar (per actualitzacions
 *   intermèdies, p. ex. mentre l'usuari escriu cada caràcter).
 * - `commit(v?)` afegeix una entrada a l'historial. Si es passa `v`,
 *   l'aplica i empila; si no, empila el valor actual.
 * - `undo`/`redo` retrocedeixen/avancen.
 *
 * Patró d'ús al WysiwygEditor:
 *   - cada `onChange` del contentEditable fa `setValue(newVal)` + `scheduleCommit()`
 *     (que fa `commit()` després d'un debounce, p. ex. 400ms).
 *   - cada inserció via menú fa `commit(insertResult)` directament
 *     (és una acció discreta, l'usuari espera poder desfer cada inserció).
 *
 * Pivot per a la sincronització amb l'editor: quan undo/redo s'apliquen,
 * el `value` retornat ja conté el valor antic; l'editor (controlat per
 * `value`) es refresca automàticament.
 */
export function useEditorHistory(initial: string) {
  const [value, setValueState] = useState(initial)
  const stackRef = useRef<string[]>([initial])
  const idxRef = useRef(0)
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setValue = useCallback((v: string) => {
    setValueState(v)
  }, [])

  /** Afegeix una entrada a l'historial. Si `v` es passa, també substitueix value. */
  const commit = useCallback((v?: string) => {
    const next = v ?? value
    // Eliminar el "futur" si estem a mig historial
    const stack = stackRef.current.slice(0, idxRef.current + 1)
    if (stack[stack.length - 1] === next) {
      // Mateix valor → no empilem (evita duplicats)
      stackRef.current = stack
      return
    }
    stack.push(next)
    stackRef.current = stack
    idxRef.current = stack.length - 1
    if (v !== undefined && v !== value) setValueState(v)
  }, [value])

  /** Programa un commit després d'un debounce. Útil per a escriptura contínua. */
  const scheduleCommit = useCallback((v: string, ms = 400) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
    commitTimerRef.current = setTimeout(() => {
      // Eliminem el futur i empilem el valor passat
      const stack = stackRef.current.slice(0, idxRef.current + 1)
      if (stack[stack.length - 1] !== v) {
        stack.push(v)
        stackRef.current = stack
        idxRef.current = stack.length - 1
      }
      commitTimerRef.current = null
    }, ms)
  }, [])

  const undo = useCallback(() => {
    if (idxRef.current <= 0) return
    idxRef.current--
    setValueState(stackRef.current[idxRef.current])
  }, [])

  const redo = useCallback(() => {
    if (idxRef.current >= stackRef.current.length - 1) return
    idxRef.current++
    setValueState(stackRef.current[idxRef.current])
  }, [])

  /** Substitueix tot l'historial (per "carregar cançó per editar"). */
  const reset = useCallback((v: string) => {
    stackRef.current = [v]
    idxRef.current = 0
    setValueState(v)
  }, [])

  return {
    value,
    setValue,
    commit,
    scheduleCommit,
    undo,
    redo,
    reset,
    canUndo: idxRef.current > 0,
    canRedo: idxRef.current < stackRef.current.length - 1,
  }
}
