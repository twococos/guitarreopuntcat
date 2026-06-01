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
import type { CanconerListItem } from "@/types/song"

export function CanconerPanel() {
  const t = getT()
  const { data: session } = useSession()
  const canconer = useSongbookStore((s) => s.canconer)
  const previewActive = useSongbookStore((s) => s.previewActive)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
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

  const hasItems = canconer.length > 0
  const isLoggedIn = !!(session?.user?.active)
  const titleIsDefault = isDefaultCanconerTitle(canconerTitle)
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
          placeholder={t.app.songbook.canconerPanel.titolPlaceholder}
          value={canconerTitle}
          onChange={(e) => setCanconerTitle(e.target.value)}
        />
        <div className="canconer-header-actions">
          <button
            id="btn-discard-canconer"
            className="btn-icon-action btn-discard"
            disabled={!canDiscard}
            title={t.app.songbook.canconerPanel.descartarTitle}
            onClick={() => setConfirmDiscard(true)}
          >
            ✕
          </button>
          <button
            id="btn-save-canconer"
            className="btn-icon-action"
            disabled={!hasItems}
            title={saveTitle}
            onClick={onSave}
          >
            💾 {t.app.songbook.canconerPanel.guardarLabel}
          </button>
          <button
            id="btn-generate"
            className="btn-icon-action"
            disabled={!hasItems || pdfLoading}
            title={t.app.songbook.canconerPanel.generarPdfTitle}
            onClick={onGeneratePdf}
          >
            {pdfLoading ? "⏳" : `📄 ${t.app.songbook.canconerPanel.pdfLabel}`}
          </button>
        </div>
      </div>
      {!hasItems && (
        <div id="canconer-empty" className="empty-state">
          <span>🎶</span>
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
