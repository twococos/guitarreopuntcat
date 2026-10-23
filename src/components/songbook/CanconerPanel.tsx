"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useSongbookStore, isDefaultCanconerTitle } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { useUiStore } from "@/hooks/useUi"
import { saveCanconer, songRefs } from "@/lib/canconerApi"
import { CanconerList } from "./CanconerList"
import { CanconerGrid } from "./CanconerGrid"
import { CanconerTitleInput } from "./CanconerTitleInput"
import { PdfDownloadButton } from "./PdfDownloadButton"
import { ConfirmToast } from "@/components/editor/ConfirmToast"
import { getT } from "@/lib/i18n"
import { IconX, IconSave, IconMusic, IconGlobe } from "@/components/shared/Icons"
import type { CanconerListItem } from "@/types/song"

export function CanconerPanel() {
  const t = getT()
  const { data: session } = useSession()
  const canconer = useSongbookStore((s) => s.canconer)
  const previewActive = useSongbookStore((s) => s.previewActive)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const provisionalTitle = useSongbookStore((s) => s.provisionalTitle)
  const canconerStyle = useSongbookStore((s) => s.canconerStyle)
  const accentColor = useSongbookStore((s) => s.accentColor)
  const pdfOptions = useSongbookStore((s) => s.pdfOptions)
  const savedCanconerId = useSongbookStore((s) => s.savedCanconerId)
  const setOverwriteToast = useSongbookStore((s) => s.setOverwriteToast)
  const markSaved = useSongbookStore((s) => s.markSaved)
  const resetCanconer = useSongbookStore((s) => s.resetCanconer)
  const showToast = useToastStore((s) => s.show)
  const setLoginPopup = useUiStore((s) => s.setLoginPopup)

  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Visibilitat del cançoner desat (null: no desat o encara no se sap)
  const [visibility, setVisibility] = useState<number | null>(null)

  useEffect(() => {
    setVisibility(null)
    if (savedCanconerId === null || savedCanconerId < 0) return
    let cancelled = false
    void fetch(`/api/canconers/${savedCanconerId}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ visibility: number }>) : null))
      .then((d) => {
        if (!cancelled && d) setVisibility(d.visibility)
      })
    return () => {
      cancelled = true
    }
  }, [savedCanconerId])

  async function onToggleVisibility() {
    if (savedCanconerId === null || visibility === null) return
    const next = visibility === 1 ? 0 : 1
    const privades = canconer.filter((e) => e.song.state !== 0).length
    const msg = next === 1
      ? t.app.library.canconersTab.confirmPublicar(privades)
      : t.app.library.canconersTab.confirmRetirar
    if (!confirm(msg)) return
    const res = await fetch(`/api/canconers/${savedCanconerId}/visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: next }),
    })
    if (!res.ok) {
      showToast(t.app.library.canconersTab.toastErrorVisibilitat, { type: "error" })
      return
    }
    setVisibility(next)
    showToast(next === 1 ? t.app.library.canconersTab.toastPublicat : t.app.library.canconersTab.toastRetirat)
  }

  const hasItems = canconer.length > 0
  const isLoggedIn = !!(session?.user?.active)
  const titleIsDefault = canconerTitle === provisionalTitle || isDefaultCanconerTitle(canconerTitle)
  // Es pot descartar si hi ha qualsevol contingut o si el títol s'ha canviat
  const canDiscard = hasItems || !titleIsDefault || savedCanconerId !== null

  let saveTitle: string = t.app.songbook.canconerPanel.guardarTitle
  if (!hasItems) saveTitle = t.app.songbook.canconerPanel.guardarTitleSensCancons
  else if (!isLoggedIn) saveTitle = t.app.songbook.canconerPanel.guardarTitleSenseSessio

  async function onSave() {
    if (!hasItems) return
    if (!isLoggedIn) {
      setLoginPopup(true)
      return
    }

    // Comprovar duplicat per títol. Sempre que ja existeixi un cançoner
    // amb el mateix nom (encara que sigui el mateix que es va carregar),
    // mostrar el toast de confirmació de sobreescriptura.
    try {
      const res = await fetch("/api/canconers")
      if (res.ok) {
        const list = (await res.json()) as CanconerListItem[]
        const titleLower = canconerTitle.trim().toLowerCase()
        const duplicate = list.find((c) => c.title.toLowerCase() === titleLower)
        if (duplicate) {
          setOverwriteToast({
            title: canconerTitle,
            style: canconerStyle,
            accentColor,
            pdfOptions,
            duplicateId: duplicate.id,
            songs: songRefs(canconer),
          })
          return
        }
      }
    } catch {
      // Si falla la petició, continuem amb el save normal
    }

    const songs = songRefs(canconer)
    const newId = await saveCanconer(
      canconerTitle,
      canconerStyle,
      accentColor,
      pdfOptions,
      songs,
      savedCanconerId,
    )
    if (newId != null) {
      markSaved(newId)
      showToast(t.app.songbook.canconerPanel.toastGuardat)
    } else {
      showToast(t.app.songbook.canconerPanel.toastErrorGuardant, { type: "error" })
    }
  }

  function onConfirmDiscard() {
    resetCanconer()
    setConfirmDiscard(false)
    showToast(t.app.songbook.canconerPanel.toastDescartat)
  }

  return (
    <section id="panel-canconer">
      <div className="canconer-header">
        <CanconerTitleInput id="canconer-title" className="canconer-title-input" />
        <div className="canconer-header-actions">
          <button
            id="btn-discard-canconer"
            className="btn-icon-action btn-discard"
            disabled={!canDiscard}
            title={t.app.songbook.canconerPanel.descartarTitle}
            onClick={() => setConfirmDiscard(true)}
            aria-label={t.app.songbook.canconerPanel.descartarTitle}
          >
            <IconX />
          </button>
          <button
            id="btn-save-canconer"
            className="btn-icon-action"
            disabled={!hasItems}
            title={saveTitle}
            onClick={onSave}
          >
            <IconSave /> {t.app.songbook.canconerPanel.guardarLabel}
          </button>
          {isLoggedIn && visibility !== null && (
            <button
              id="btn-publish-canconer"
              className={`btn-icon-action${visibility === 1 ? " is-active" : ""}`}
              title={
                visibility === 1
                  ? t.app.library.canconersTab.retirar
                  : `${t.app.library.canconersTab.publicar}. ${t.app.songbook.canconerPanel.publicarDesatHint}`
              }
              aria-pressed={visibility === 1}
              onClick={() => void onToggleVisibility()}
            >
              <IconGlobe />{" "}
              {visibility === 1 ? t.app.library.canconersTab.public : t.app.songbook.canconerPanel.publicarLabel}
            </button>
          )}
          {/* Amb la vista prèvia oberta, el PDF és a la seva capçalera. */}
          {!previewActive && <PdfDownloadButton variant="panel" />}
        </div>
      </div>
      {!hasItems && (
        <div id="canconer-empty" className="empty-state">
          <span><IconMusic /></span>
          <p>{t.app.songbook.canconerPanel.buitHint}</p>
        </div>
      )}
      {hasItems && previewActive && <CanconerList />}
      {hasItems && !previewActive && <CanconerGrid />}
      <ConfirmToast
        open={confirmDiscard}
        message={t.app.songbook.canconerPanel.confirmDescartarMissatge}
        confirmLabel={t.app.songbook.canconerPanel.confirmDescartarLabel}
        confirmVariant="danger"
        cancelLabel={t.app.songbook.canconerPanel.confirmDescartarCancellar}
        onConfirm={onConfirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        autoDismissMs={10000}
      />
    </section>
  )
}
