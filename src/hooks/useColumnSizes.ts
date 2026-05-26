"use client"
import { create } from "zustand"

/**
 * Mides de les columnes esquerra i dreta del layout principal de `/`.
 * Persistent a localStorage (clau `canconer_column_sizes`) per recordar
 * les preferències d'amplada entre sessions.
 *
 * IMPORTANT: el render inicial (SSR + primer client render) SEMPRE
 * usa els defaults. La hidratació des de localStorage es fa explícitament
 * via `hydrateColumnSizes()` cridada des d'un `useEffect`, per evitar
 * mismatches d'hidratació entre servidor i client.
 */

const STORAGE_KEY = "canconer_column_sizes"

export const LEFT_MIN = 220
export const LEFT_MAX = 480
export const LEFT_DEFAULT = 300

export const RIGHT_MIN = 25
export const RIGHT_MAX = 65
export const RIGHT_DEFAULT = 42

interface Persisted {
  v: 1
  left: number
  right: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function persist(left: number, right: number) {
  if (typeof window === "undefined") return
  try {
    const payload: Persisted = { v: 1, left, right }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota errors
  }
}

interface ColumnSizesState {
  leftWidth: number
  rightWidth: number
  hydrated: boolean
  setLeftWidth: (v: number) => void
  setRightWidth: (v: number) => void
  hydrate: () => void
}

export const useColumnSizesStore = create<ColumnSizesState>((set, get) => ({
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
  hydrated: false,
  setLeftWidth(v) {
    const next = clamp(v, LEFT_MIN, LEFT_MAX)
    set({ leftWidth: next })
    persist(next, get().rightWidth)
  },
  setRightWidth(v) {
    const next = clamp(v, RIGHT_MIN, RIGHT_MAX)
    set({ rightWidth: next })
    persist(get().leftWidth, next)
  },
  hydrate() {
    if (get().hydrated) return
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw) as Persisted
        if (data?.v === 1) {
          set({
            leftWidth: clamp(data.left ?? LEFT_DEFAULT, LEFT_MIN, LEFT_MAX),
            rightWidth: clamp(data.right ?? RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX),
            hydrated: true,
          })
          return
        }
      }
    } catch {
      // Ignore parse errors
    }
    set({ hydrated: true })
  },
}))
