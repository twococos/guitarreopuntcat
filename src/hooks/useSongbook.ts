"use client"
import { create } from "zustand"
import { CHROMATIC } from "@/lib/transpose"
import type { Song, SongSummary, CanconerStyle } from "@/types/song"

/* ── Constants compartides ───────────────────────────────── */

export const ALL_MAJOR_KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const

export const RELATIVE_MINOR: Record<string, string> = {
  C: "Am",
  "C#": "A#m",
  D: "Bm",
  "D#": "Cm",
  E: "C#m",
  F: "Dm",
  "F#": "D#m",
  G: "Em",
  "G#": "Fm",
  A: "F#m",
  "A#": "Gm",
  B: "G#m",
}

/* ── Helpers de tonalitat ───────────────────────────────── */

function isMinorKey(key: string): boolean {
  return key.endsWith("m") && key !== "F" && key !== "C"
}

/** Donat un to (major o menor), retorna la seva arrel major equivalent. */
function toMajorRoot(key: string): string {
  const root = key.replace("m", "")
  if (isMinorKey(key)) {
    const idx = (CHROMATIC as readonly string[]).indexOf(root)
    if (idx !== -1) {
      return CHROMATIC[(idx + 3) % 12]
    }
  }
  return root
}

/* ── Tipus de l'estat ───────────────────────────────────── */

export type SortMode = "custom" | "title" | "artist" | "random"

export interface CanconerEntry {
  song: Song
  semitones: number
}

export interface KeyMenuState {
  idx: number
  anchorRect: { left: number; top: number; bottom: number; right: number }
}

export interface SongbookState {
  /* ── Dades ── */
  songs: SongSummary[]
  canconer: CanconerEntry[]
  selectedIdx: number | null

  /* ── UI ── */
  previewActive: boolean
  sortMode: SortMode
  sortAsc: boolean
  allowedKeys: Set<string>
  keyMenu: KeyMenuState | null

  /* ── Persistència ── */
  savedCanconerId: number | null
  canconerTitle: string
  canconerStyle: CanconerStyle
  accentColor: string | null

  /* ── Search/sort de la llista de cançons (col 1) ── */
  searchTerm: string
  songSortBy: "title" | "artist" | "key"

  /* ── Toast d'overwrite ── */
  overwriteToast: {
    title: string
    style: CanconerStyle
    accentColor: string | null
    duplicateId: number
    songs: Array<{ id: number; semitones: number }>
  } | null

  /* ── Actions ── */
  loadSongs: () => Promise<void>
  setSearchTerm: (v: string) => void
  setSongSortBy: (v: "title" | "artist" | "key") => void

  addToCanconer: (songId: number) => Promise<void>
  removeFromCanconer: (idx: number) => void
  reorder: (from: number, to: number) => void
  setSemitones: (idx: number, value: number) => void
  bumpSemitones: (idx: number, delta: number) => void
  setSelectedIdx: (idx: number | null) => void

  setSortMode: (mode: SortMode) => void
  toggleSortDir: () => void
  reshuffle: () => void

  toggleAllowedKey: (key: string) => void
  applyAllowedKeys: () => { count: number }

  togglePreviewActive: () => void

  openKeyMenu: (
    idx: number,
    anchorRect: { left: number; top: number; bottom: number; right: number },
  ) => void
  closeKeyMenu: () => void

  setCanconerTitle: (title: string) => void
  setCanconerStyle: (style: CanconerStyle) => void
  setAccentColor: (color: string | null) => void

  setOverwriteToast: (toast: SongbookState["overwriteToast"]) => void

  /** Substitueix tot el cançoner (per carregar un guardat existent). */
  loadExistingCanconer: (data: {
    id: number
    title: string
    style: CanconerStyle
    accentColor: string | null
    entries: CanconerEntry[]
  }) => void

  /** Marcar que ha estat guardat (després de POST OK). */
  markSaved: (id: number) => void
}

/* ── Ordenació interna del cançoner ─────────────────────── */

function sortCanconerEntries(
  canconer: CanconerEntry[],
  mode: SortMode,
  asc: boolean,
): CanconerEntry[] {
  if (mode === "custom" || canconer.length === 0) return canconer.slice()
  const copy = canconer.slice()
  if (mode === "title") {
    copy.sort((a, b) => {
      const cmp = a.song.title.localeCompare(b.song.title, "ca", { sensitivity: "base" })
      return asc ? cmp : -cmp
    })
  } else if (mode === "artist") {
    copy.sort((a, b) => {
      const cmpA = a.song.artist.localeCompare(b.song.artist, "ca", { sensitivity: "base" })
      if (cmpA !== 0) return asc ? cmpA : -cmpA
      const cmpT = a.song.title.localeCompare(b.song.title, "ca", { sensitivity: "base" })
      return asc ? cmpT : -cmpT
    })
  } else if (mode === "random") {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
  }
  return copy
}

/* ── Helper per mantenir selectedIdx després d'una ordenació ─ */

function reindexSelected(
  prev: CanconerEntry[],
  next: CanconerEntry[],
  prevIdx: number | null,
): number | null {
  if (prevIdx === null) return null
  const ref = prev[prevIdx]
  if (!ref) return null
  const newIdx = next.indexOf(ref)
  return newIdx >= 0 ? newIdx : null
}

/* ── Store ───────────────────────────────────────────────── */

export const useSongbookStore = create<SongbookState>((set, get) => ({
  songs: [],
  canconer: [],
  selectedIdx: null,
  previewActive: true,
  sortMode: "custom",
  sortAsc: true,
  allowedKeys: new Set(ALL_MAJOR_KEYS),
  keyMenu: null,
  savedCanconerId: null,
  canconerTitle: "El meu cançoner",
  canconerStyle: "classic",
  accentColor: null,
  searchTerm: "",
  songSortBy: "title",
  overwriteToast: null,

  async loadSongs() {
    const { searchTerm, songSortBy } = get()
    const params = new URLSearchParams({ sortBy: songSortBy })
    if (searchTerm.trim()) params.set("search", searchTerm.trim())
    const res = await fetch(`/api/songs?${params}`)
    const songs: SongSummary[] = await res.json()
    set({ songs })
  },

  setSearchTerm(v) {
    set({ searchTerm: v })
  },

  setSongSortBy(v) {
    set({ songSortBy: v })
  },

  async addToCanconer(songId) {
    const { canconer, songs } = get()
    // Carregar la cançó sencera (els elements de songs no inclouen content)
    let full: Song
    const summary = songs.find((s) => s.id === songId)
    if (summary && "content" in summary) {
      full = summary as unknown as Song
    } else {
      const res = await fetch(`/api/songs/${songId}`)
      full = await res.json()
    }
    const next = [...canconer, { song: full, semitones: 0 }]
    set({
      canconer: next,
      selectedIdx: next.length - 1,
    })
  },

  removeFromCanconer(idx) {
    const { canconer, selectedIdx } = get()
    const next = canconer.slice()
    next.splice(idx, 1)
    let newSel = selectedIdx
    if (selectedIdx !== null) {
      if (next.length === 0) newSel = null
      else if (idx < selectedIdx) newSel = selectedIdx - 1
      else if (idx === selectedIdx) {
        // Selecciona la mateixa posició, o la última si era la final
        newSel = Math.min(selectedIdx, next.length - 1)
      }
    }
    set({ canconer: next, selectedIdx: newSel })
  },

  reorder(from, to) {
    if (from === to) return
    const { canconer, selectedIdx } = get()
    if (from < 0 || from >= canconer.length || to < 0 || to >= canconer.length) return
    const next = canconer.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    let newSel = selectedIdx
    if (selectedIdx !== null) {
      if (selectedIdx === from) newSel = to
      else if (from < selectedIdx && to >= selectedIdx) newSel = selectedIdx - 1
      else if (from > selectedIdx && to <= selectedIdx) newSel = selectedIdx + 1
    }
    set({ canconer: next, selectedIdx: newSel, sortMode: "custom" })
  },

  setSemitones(idx, value) {
    const { canconer } = get()
    if (idx < 0 || idx >= canconer.length) return
    const next = canconer.slice()
    next[idx] = { ...next[idx], semitones: ((value % 12) + 12) % 12 }
    set({ canconer: next })
  },

  bumpSemitones(idx, delta) {
    const { canconer } = get()
    if (idx < 0 || idx >= canconer.length) return
    const cur = canconer[idx].semitones
    const next = canconer.slice()
    next[idx] = { ...next[idx], semitones: ((cur + delta) % 12 + 12) % 12 }
    set({ canconer: next })
  },

  setSelectedIdx(idx) {
    set({ selectedIdx: idx })
  },

  setSortMode(mode) {
    const { canconer, selectedIdx, sortAsc } = get()
    if (mode === "custom") {
      set({ sortMode: "custom" })
      return
    }
    const next = sortCanconerEntries(canconer, mode, sortAsc)
    const newSel = reindexSelected(canconer, next, selectedIdx)
    set({ sortMode: mode, canconer: next, selectedIdx: newSel })
  },

  toggleSortDir() {
    const { canconer, selectedIdx, sortMode, sortAsc } = get()
    const newAsc = !sortAsc
    if (sortMode === "custom" || sortMode === "random") {
      set({ sortAsc: newAsc })
      return
    }
    const next = sortCanconerEntries(canconer, sortMode, newAsc)
    const newSel = reindexSelected(canconer, next, selectedIdx)
    set({ sortAsc: newAsc, canconer: next, selectedIdx: newSel })
  },

  reshuffle() {
    const { canconer, selectedIdx } = get()
    const next = sortCanconerEntries(canconer, "random", true)
    const newSel = reindexSelected(canconer, next, selectedIdx)
    set({ sortMode: "random", canconer: next, selectedIdx: newSel })
  },

  toggleAllowedKey(key) {
    const { allowedKeys } = get()
    const next = new Set(allowedKeys)
    if (next.has(key)) {
      if (next.size <= 1) return // mínim una activa
      next.delete(key)
    } else {
      next.add(key)
    }
    set({ allowedKeys: next })
  },

  applyAllowedKeys() {
    const { canconer, allowedKeys } = get()
    if (canconer.length === 0) return { count: 0 }
    let changedCount = 0
    const next = canconer.map((entry) => {
      const originalKey = entry.song.key
      const originalMajorRoot = toMajorRoot(originalKey)

      if (allowedKeys.has(originalMajorRoot)) {
        // Restaurar to original
        if (entry.semitones !== 0) changedCount++
        return { ...entry, semitones: 0 }
      }

      // Si el to actual ja és permès, no toquem res
      const rootIdx = (CHROMATIC as readonly string[]).indexOf(originalKey.replace("m", ""))
      if (rootIdx === -1) return entry
      const currentRoot = CHROMATIC[(rootIdx + entry.semitones + 12) % 12]
      const currentKey = isMinorKey(originalKey) ? currentRoot + "m" : currentRoot
      if (allowedKeys.has(toMajorRoot(currentKey))) return entry

      // Buscar el to permès més proper a l'ORIGINAL MAJOR ROOT
      // (no a l'arrel literal del to: per Am, la referència és C, no A).
      // Així es preserva la relació "Am ≡ C" en el càlcul de distància.
      const originalMajorIdx = (CHROMATIC as readonly string[]).indexOf(originalMajorRoot)
      if (originalMajorIdx === -1) return entry

      let bestDelta = 0
      let bestDist = Infinity
      for (const major of allowedKeys) {
        const majorIdx = (CHROMATIC as readonly string[]).indexOf(major)
        if (majorIdx === -1) continue
        // Distància entre el major equivalent original i el major permès
        const delta = (majorIdx - originalMajorIdx + 12) % 12
        const dist = delta <= 6 ? delta : 12 - delta
        if (dist < bestDist) {
          bestDist = dist
          // Mantenim positiu (mateix patró que l'app antiga)
          bestDelta = delta <= 6 ? delta : delta - 12
          if (bestDelta < 0) bestDelta = (bestDelta + 12) % 12
        }
      }
      if (entry.semitones !== bestDelta) changedCount++
      return { ...entry, semitones: bestDelta }
    })
    set({ canconer: next })
    return { count: changedCount }
  },

  togglePreviewActive() {
    set((s) => ({ previewActive: !s.previewActive }))
  },

  openKeyMenu(idx, anchorRect) {
    set({ keyMenu: { idx, anchorRect } })
  },

  closeKeyMenu() {
    set({ keyMenu: null })
  },

  setCanconerTitle(title) {
    set({ canconerTitle: title })
  },

  setCanconerStyle(style) {
    // En canviar de preset, reseteja l'accent a null perquè la cançó
    // adopti el color default del nou preset. Si l'usuari vol un color
    // custom, el torna a triar des del picker.
    set({ canconerStyle: style, accentColor: null })
  },

  setAccentColor(color) {
    set({ accentColor: color })
  },

  setOverwriteToast(toast) {
    set({ overwriteToast: toast })
  },

  loadExistingCanconer({ id, title, style, accentColor, entries }) {
    set({
      savedCanconerId: id,
      canconerTitle: title,
      canconerStyle: style,
      accentColor: accentColor,
      canconer: entries,
      selectedIdx: entries.length > 0 ? 0 : null,
      sortMode: "custom",
    })
  },

  markSaved(id) {
    set({ savedCanconerId: id })
  },
}))
