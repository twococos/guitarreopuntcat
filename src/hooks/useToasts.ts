"use client"
import { create } from "zustand"

export interface ToastItem {
  id: number
  message: string
  type?: "info" | "error" | "success"
}

interface ToastStore {
  items: ToastItem[]
  show: (message: string, opts?: { type?: ToastItem["type"]; durationMs?: number }) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  show(message, opts) {
    const id = nextId++
    const item: ToastItem = { id, message, type: opts?.type ?? "info" }
    set((s) => ({ items: [...s.items, item] }))
    const dur = opts?.durationMs ?? 3000
    setTimeout(() => get().dismiss(id), dur)
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((it) => it.id !== id) }))
  },
}))
