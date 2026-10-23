"use client"
import { create } from "zustand"

interface UiStore {
  proposeLoginVisible: boolean
  loginPopupVisible: boolean
  /** Overlay d'inici de /app (obre o crea un cançoner). Només es mostra
   *  amb sessió i sense cap cançoner en curs (vegeu `SongbookEditor`). */
  startOverlayOpen: boolean
  setProposeLogin: (v: boolean) => void
  setLoginPopup: (v: boolean) => void
  setStartOverlay: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  proposeLoginVisible: false,
  loginPopupVisible: false,
  startOverlayOpen: false,
  setProposeLogin: (v) => set({ proposeLoginVisible: v }),
  setLoginPopup: (v) => set({ loginPopupVisible: v }),
  setStartOverlay: (v) => set({ startOverlayOpen: v }),
}))
