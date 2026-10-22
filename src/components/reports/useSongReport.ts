"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"
import { contentHash } from "@/lib/reports/dedupe"
import type { ReportCategory, ReportInput, ReportItem } from "@/lib/schemas/report"

/** Tipus d'error tal com els tria l'usuari (alguns comparteixen `kind` a la BD). */
export type UiKind =
  | "chord_wrong"
  | "chord_missing"
  | "chord_move"
  | "chord_extra"
  | "song_key"
  | "lyric_fix"
  | "lyric_missing"
  | "lyric_extra"
  | "lyric_line"
  | "lyric_version"
  | "section_rename"
  | "section_add"
  | "section_remove"
  | "section_missing"
  | "meta"
  | "other"

export const UI_KINDS: Record<ReportCategory, UiKind[]> = {
  chords: ["chord_wrong", "chord_missing", "chord_extra", "chord_move", "song_key"],
  lyrics: ["lyric_fix", "lyric_missing", "lyric_extra", "lyric_line", "lyric_version"],
  sections: ["section_rename", "section_add", "section_remove", "section_missing"],
  // La tonalitat també aquí: és on molta gent la buscarà
  other: ["song_key", "meta", "other"],
}

/** Tipus que es resolen amb un formulari al panell (sense tocar la cançó). */
export type FormKind = "song_key" | "meta" | "other" | "lyric_version"
const FORM_KINDS: readonly UiKind[] = ["song_key", "meta", "other", "lyric_version"]

/** Tipus que es marquen sobre la cançó. */
export type MarkKind = Exclude<UiKind, FormKind>

export type ReportStep =
  | { name: "closed" }
  | { name: "categories" }
  | { name: "kinds"; category: ReportCategory }
  | { name: "mark"; kind: MarkKind; category: ReportCategory }
  | { name: "form"; kind: FormKind; category: ReportCategory }
  | { name: "review" }
  | { name: "sending" }
  | { name: "thanks" }

export type ReportContext =
  | { source: "song" }
  | { source: "songbook"; songbook_id: number }
  | { source: "share"; token: string }

const THANKS_MS = 3200

export function useSongReport({
  songId,
  content,
  semitones,
  context,
}: {
  songId: number
  content: string
  semitones: number
  context: ReportContext
}) {
  const [step, setStep] = useState<ReportStep>({ name: "closed" })
  const [items, setItems] = useState<ReportItem[]>([])
  const [comment, setComment] = useState("")
  const [honeypot, setHoneypot] = useState("")
  const openedAt = useRef(0)

  const reset = useCallback(() => {
    setStep({ name: "closed" })
    setItems([])
    setComment("")
    setHoneypot("")
  }, [])

  // Canviar de cançó (visor de cançoners) descarta el report en curs
  useEffect(() => reset(), [songId, reset])

  const open = useCallback(() => {
    if (openedAt.current === 0 || step.name === "closed") openedAt.current = Date.now()
    setStep(items.length ? { name: "review" } : { name: "categories" })
  }, [items.length, step.name])

  const pickCategory = useCallback((category: ReportCategory) => setStep({ name: "kinds", category }), [])

  const pickKind = useCallback((kind: UiKind, category: ReportCategory) => {
    if ((FORM_KINDS as readonly string[]).includes(kind)) setStep({ name: "form", kind: kind as FormKind, category })
    else setStep({ name: "mark", kind: kind as MarkKind, category })
  }, [])

  const addItem = useCallback((item: ReportItem | ReportItem[]) => {
    setItems((prev) => prev.concat(item))
    setStep({ name: "review" })
  }, [])

  /** Modifica ítems ja afegits (p. ex. un acord sobre lletra que s'ha afegit) i en pot afegir. */
  const editItems = useCallback((fn: (items: ReportItem[]) => ReportItem[]) => {
    setItems(fn)
    setStep({ name: "review" })
  }, [])

  const addMore = useCallback(() => setStep({ name: "categories" }), [])

  const removeItem = useCallback(
    (idx: number) => {
      const next = items.filter((_, i) => i !== idx)
      setItems(next)
      if (!next.length) setStep({ name: "categories" })
    },
    [items],
  )

  /** Enrere: del tipus a la categoria, de la categoria a l'inici (o a la llista). */
  const back = useCallback(() => {
    setStep((s) => {
      if (s.name === "mark" || s.name === "form") return { name: "kinds", category: s.category }
      if (s.name === "kinds") return { name: "categories" }
      if (s.name === "categories" && items.length) return { name: "review" }
      return s
    })
  }, [items.length])

  const send = useCallback(async () => {
    if (!items.length) return
    setStep({ name: "sending" })
    const body: Omit<ReportInput, "context"> & { context: ReportContext } = {
      items,
      comment: comment.trim(),
      content_hash: contentHash(content),
      semitones,
      context,
      website: honeypot,
      elapsed_ms: Date.now() - openedAt.current,
    }
    try {
      const res = await fetch(`/api/songs/${songId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? getT().public.report.errorEnviant)
      }
      setStep({ name: "thanks" })
      window.setTimeout(reset, THANKS_MS)
    } catch (err) {
      setStep({ name: "review" })
      useToastStore
        .getState()
        .show(err instanceof Error ? err.message : getT().public.report.errorEnviant, { type: "error" })
    }
  }, [items, comment, content, semitones, context, honeypot, songId, reset])

  return useMemo(
    () => ({
      step,
      items,
      comment,
      setComment,
      honeypot,
      setHoneypot,
      /** La cançó està en mode correcció (es toca la cançó). */
      marking: step.name === "mark" ? step.kind : null,
      active: step.name !== "closed",
      open,
      close: reset,
      pickCategory,
      pickKind,
      addItem,
      editItems,
      addMore,
      removeItem,
      back,
      send,
    }),
    [step, items, comment, honeypot, open, reset, pickCategory, pickKind, addItem, editItems, addMore, removeItem, back, send],
  )
}

export type SongReport = ReturnType<typeof useSongReport>
