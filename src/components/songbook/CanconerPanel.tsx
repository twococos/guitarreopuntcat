"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { useSongbookStore, isDefaultCanconerTitle } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { useUiStore } from "@/hooks/useUi"
import { saveCanconer } from "@/lib/canconerApi"
import { CanconerList } from "./CanconerList"
import { CanconerGrid } from "./CanconerGrid"
import { ConfirmToast } from "@/components/editor/ConfirmToast"
import { getT } from "@/lib/i18n"
import { IconX, IconSave, IconClock, IconFileText, IconMusic } from "@/components/shared/Icons"
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
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)
  const setOverwriteToast = useSongbookStore((s) => s.setOverwriteToast)
  const markSaved = useSongbookStore((s) => s.markSaved)
  const resetCanconer = useSongbookStore((s) => s.resetCanconer)
  const showToast = useToastStore((s) => s.show)
  const setLoginPopup = useUiStore((s) => s.setLoginPopup)

  const [pdfLoading, setPdfLoading] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Mentre el camp té focus mostrem el text "buit" perquè el placeholder
  // (el títol provisional) faci de hint. En perdre focus, si l'usuari no
  // ha escrit res, restaurem el provisional perquè mai s'arribi a guardar
  // sense nom.
  const [titleFocused, setTitleFocused] = useState(false)

  const hasItems = canconer.length > 0
  const isLoggedIn = !!(session?.user?.active)
  const titleIsProvisional = canconerTitle === provisionalTitle
  // El títol "provisional" en estilem en gris (com un placeholder permanent).
  // Per compat retornem true també per als "El meu cançoner N" perquè altres
  // llocs (autoguardat) hi confiïn.
  const titleIsDefault = titleIsProvisional || isDefaultCanconerTitle(canconerTitle)
  // Mentre el camp té focus i el valor és el provisional, el mostrem buit
  // perquè el placeholder (el provisional) actuï com a hint.
  const displayedTitle = titleFocused && titleIsProvisional ? "" : canconerTitle
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
            songs: canconer.map((e) => ({ id: e.song.id, semitones: e.semitones })),
          })
          return
        }
      }
    } catch {
      // Si falla la petició, continuem amb el save normal
    }

    const songs = canconer.map((e) => ({ id: e.song.id, semitones: e.semitones }))
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

  async function onGeneratePdf() {
    if (!hasItems || pdfLoading) return
    setPdfLoading(true)
    try {
      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: canconerTitle || "El meu cançoner",
          style: canconerStyle,
          accent_color: accentColor,
          pdf_options: pdfOptions,
          songs: canconer.map((e) => ({ id: e.song.id, semitones: e.semitones })),
        }),
      })
      if (!res.ok) throw new Error("PDF error")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${canconerTitle || "canconer"}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(t.app.songbook.canconerPanel.errorGenerantPdf)
    } finally {
      setPdfLoading(false)
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
        <input
          type="text"
          id="canconer-title"
          className={`canconer-title-input${titleIsDefault ? " is-default" : ""}`}
          placeholder={provisionalTitle}
          value={displayedTitle}
          onChange={(e) => setCanconerTitle(e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => {
            setTitleFocused(false)
            // Si l'usuari l'ha deixat buit, restaura el provisional perquè
            // mai pugui quedar el camp sense nom.
            if (canconerTitle.trim() === "") {
              setCanconerTitle(provisionalTitle)
            }
          }}
        />
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
          <button
            id="btn-generate"
            className="btn-icon-action"
            disabled={!hasItems || pdfLoading}
            title={t.app.songbook.canconerPanel.generarPdfTitle}
            onClick={onGeneratePdf}
          >
            {pdfLoading ? (
              <IconClock />
            ) : (
              <>
                <IconFileText /> {t.app.songbook.canconerPanel.pdfLabel}
              </>
            )}
          </button>
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
