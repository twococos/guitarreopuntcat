"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { getT } from "@/lib/i18n"
import { IconX } from "@/components/shared/Icons"
import { OptionsAccordion } from "./OptionsAccordion"
import { StoreOptionsSource } from "./OptionsSource"
import {
  StructureSection,
  StyleSection,
  BodySection,
  OrderSection,
  KeysSection,
  NotationSection,
  ChordsSection,
  LinksSection,
} from "./sections"
import type { ReactElement } from "react"

/* ── Categories ──────────────────────────────────────────────
 *  L'ordre és el de la UI; la primera és la que s'obre per defecte.
 *  `side: "right"` són les que cal mirar amb la llista del cançoner:
 *  el panell passa a sobre de la vista prèvia i la llista queda nítida. */

export type OptionsCategoryId = "structure" | "style" | "body" | "order" | "keys" | "notation" | "chords" | "links"

/** Categoria de la portada (la primera): la usa l'ítem «Portada» de la llista. */
export const COVER_CATEGORY_ID: OptionsCategoryId = "structure"

interface OptionsCategory {
  id: OptionsCategoryId
  title: string
  side: "left" | "right"
  Body: () => ReactElement
}

function categories(): OptionsCategory[] {
  const d = getT().app.songbook.detailPanel
  return [
    { id: "structure", title: d.catPortada, side: "left", Body: StructureSection },
    { id: "style", title: d.estilCanconer, side: "left", Body: StyleSection },
    { id: "body", title: d.cos, side: "left", Body: BodySection },
    { id: "order", title: d.ordreCancons, side: "right", Body: OrderSection },
    { id: "keys", title: d.tonalitatPermeses, side: "right", Body: KeysSection },
    { id: "notation", title: d.formatAlteracions, side: "left", Body: NotationSection },
    { id: "chords", title: d.catAcords, side: "left", Body: ChordsSection },
    { id: "links", title: d.enllacosIQr, side: "left", Body: LinksSection },
  ]
}

const OPEN_CATEGORY_STORAGE_KEY = "canconer.optionsCategory"

function findCategory(list: OptionsCategory[], id: string | null): OptionsCategoryId | null {
  return list.find((c) => c.id === id)?.id ?? null
}

function readStoredCategory(list: OptionsCategory[]): OptionsCategoryId | null {
  try {
    return findCategory(list, localStorage.getItem(OPEN_CATEGORY_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeCategory(id: OptionsCategoryId): void {
  try {
    localStorage.setItem(OPEN_CATEGORY_STORAGE_KEY, id)
  } catch {
    // localStorage no disponible: només no es recordarà
  }
}

/** La portada porta la prèvia a l'inici; la resta, a la cançó
 *  seleccionada (o la primera). */
function scrollPreviewFor(id: OptionsCategoryId): void {
  const { requestPreviewScroll, selectedIdx } = useSongbookStore.getState()
  requestPreviewScroll(id === COVER_CATEGORY_ID ? { kind: "front" } : { kind: "song", idx: selectedIdx ?? 0 })
}

/* ── OptionsPanel ────────────────────────────────────────────
 *  Panell flotant «Opcions i format». A l'esquerra es posa sobre la
 *  columna del cançoner (vista prèvia nítida per veure els canvis); a la
 *  dreta, sobre la vista prèvia (llista del cançoner nítida i usable).
 *  Es tanca amb Esc, X, o clicant fora del panell. */

export function OptionsPanel({ onClose }: { onClose: () => void }) {
  const t = getT()
  const list = categories()
  const panelRef = useRef<HTMLDivElement | null>(null)
  // El primer render sempre usa la primera categoria; la desada es llegeix
  // després (mateix criteri que useColumnSizes, per no trencar la hidratació).
  // null = totes plegades (tornar a clicar l'oberta la plega).
  const [openId, setOpenId] = useState<OptionsCategoryId | null>(list[0].id)
  // Tancament animat: marquem `closing`, deixem que l'animació de sortida
  // corri i només llavors desmuntem cridant `onClose()` real.
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  // Amb totes plegades, el panell es queda al costat on era.
  const sideRef = useRef<"left" | "right">("left")
  const side = openId ? (list.find((c) => c.id === openId)?.side ?? "left") : sideRef.current
  sideRef.current = side

  // Categoria inicial: la demanada des de fora (p. ex. «Edita» de la
  // portada) o, si no, l'última oberta. Amb el panell obert, una petició
  // nova també hi salta.
  const pendingCategory = useSongbookStore((s) => s.optionsPendingCategory)
  const clearPending = useSongbookStore((s) => s.clearOptionsPendingCategory)
  const initializedRef = useRef(false)
  useEffect(() => {
    const all = categories()
    const pending = findCategory(all, pendingCategory)
    if (pending) clearPending()
    if (!initializedRef.current) {
      initializedRef.current = true
      const first = pending ?? readStoredCategory(all) ?? all[0].id
      setOpenId(first)
      if (pending) storeCategory(pending)
      scrollPreviewFor(first)
      return
    }
    if (pending) openCategory(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCategory])

  function openCategory(id: OptionsCategoryId | null) {
    if (id === null) {
      setOpenId(null)
      return
    }
    scrollPreviewFor(id)
    if (id === openId) return
    setOpenId(id)
    storeCategory(id)
  }

  const requestClose = useCallback(() => {
    if (closeTimer.current != null) return // ja s'està tancant
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 160)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  // Classes del <body> que difuminen les columnes que no són el focus.
  useEffect(() => {
    document.body.classList.add("options-overlay-active")
    return () => document.body.classList.remove("options-overlay-active")
  }, [])
  useEffect(() => {
    document.body.classList.toggle("options-side-right", side === "right")
    return () => document.body.classList.remove("options-side-right")
  }, [side])

  // Tancar amb Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [requestClose])

  // Clic fora del panell → tanca. No comptem el botó toggle (el seu
  // `onClick` ja fa el toggle; si no, el `mousedown` tancaria i el `click`
  // tornaria a obrir) ni, en mode dreta, la llista del cançoner i el menú
  // de tonalitat que s'hi obre: són el focus del panell.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const panel = panelRef.current
      if (!panel) return
      const target = e.target as Element
      if (panel.contains(target)) return
      if (target.closest?.(".detail-tab.is-toggle")) return
      if (sideRef.current === "right" && target.closest?.("#panel-canconer, #key-menu")) return
      requestClose()
    }
    // Esperem un tick per no atrapar el mateix clic que obre el panell.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onClick)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("mousedown", onClick)
    }
  }, [requestClose])

  return (
    <div
      ref={panelRef}
      className={`options-panel${side === "right" ? " is-right" : ""}${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={t.app.songbook.detailPanel.tabOpcionsFormat}
    >
      <div className="options-panel-header">
        <h2 className="options-panel-title">{t.app.songbook.detailPanel.tabOpcionsFormat}</h2>
        <button
          className="options-panel-close"
          onClick={requestClose}
          title={t.app.songbook.detailPanel.tancarOpcions}
          aria-label={t.app.songbook.detailPanel.tancarOpcions}
        >
          <IconX />
        </button>
      </div>
      <div className="options-panel-body">
        <StoreOptionsSource>
          <OptionsAccordion categories={list} openId={openId} onOpen={openCategory} />
        </StoreOptionsSource>
      </div>
    </div>
  )
}
