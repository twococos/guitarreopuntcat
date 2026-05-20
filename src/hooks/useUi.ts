"use client"
import { create } from "zustand"

interface UiStore {
  proposeLoginVisible: boolean
  loginPopupVisible: boolean
  setProposeLogin: (v: boolean) => void
  setLoginPopup: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  proposeLoginVisible: false,
  loginPopupVisible: false,
  setProposeLogin: (v) => set({ proposeLoginVisible: v }),
  setLoginPopup: (v) => set({ loginPopupVisible: v }),
}))
