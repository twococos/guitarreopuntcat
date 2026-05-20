"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { useUiStore } from "@/hooks/useUi"
import { saveCanconer } from "@/lib/canconerApi"
import { CanconerList } from "./CanconerList"
import { CanconerGrid } from "./CanconerGrid"
import type { CanconerListItem } from "@/types/song"

export function CanconerPanel() {
  const { data: session } = useSession()
  const canconer = useSongbookStore((s) => s.canconer)
  const previewActive = useSongbookStore((s) => s.previewActive)
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const savedCanconerId = useSongbookStore((s) => s.savedCanconerId)
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)
  const setOverwriteToast = useSongbookStore((s) => s.setOverwriteToast)
  const markSaved = useSongbookStore((s) => s.markSaved)
  const showToast = useToastStore((s) => s.show)
  const setLoginPopup = useUiStore((s) => s.setLoginPopup)

  const [pdfLoading, setPdfLoading] = useState(false)

  const hasItems = canconer.length > 0
  const isLoggedIn = !!(session?.user?.active)

  let saveTitle = "Guardar cançoner"
  if (!hasItems) saveTitle = "Afegeix cançons primer"
  else if (!isLoggedIn) saveTitle = "Inicia sessió per guardar"

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
    const newId = await saveCanconer(canconerTitle, songs, savedCanconerId)
    if (newId != null) {
      markSaved(newId)
      showToast("Cançoner guardat!")
    } else {
      showToast("Error guardant el cançoner", { type: "error" })
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
      alert("Error generant el PDF.")
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <section id="panel-canconer">
      <div className="canconer-header">
        <input
          type="text"
          id="canconer-title"
          placeholder="Títol del cançoner…"
          value={canconerTitle}
          onChange={(e) => setCanconerTitle(e.target.value)}
        />
        <div className="canconer-header-actions">
          <button
            id="btn-save-canconer"
            className="btn-icon-action"
            disabled={!hasItems}
            title={saveTitle}
            onClick={onSave}
          >
            💾 Guardar
          </button>
          <button
            id="btn-generate"
            className="btn-icon-action"
            disabled={!hasItems || pdfLoading}
            title="Generar PDF"
            onClick={onGeneratePdf}
          >
            {pdfLoading ? "⏳" : "📄 PDF"}
          </button>
        </div>
      </div>
      {!hasItems && (
        <div id="canconer-empty" className="empty-state">
          <span>🎶</span>
          <p>Clica una cançó per afegir-la</p>
        </div>
      )}
      {hasItems && previewActive && <CanconerList />}
      {hasItems && !previewActive && <CanconerGrid />}
    </section>
  )
}
