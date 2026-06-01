"use client"
import { useEffect } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { saveCanconer } from "@/lib/canconerApi"
import { getT } from "@/lib/i18n"

export function OverwriteToast() {
  const t = getT()
  const overwriteToast = useSongbookStore((s) => s.overwriteToast)
  const setOverwriteToast = useSongbookStore((s) => s.setOverwriteToast)
  const markSaved = useSongbookStore((s) => s.markSaved)
  const toast = useToastStore((s) => s.show)

  // Auto-dismiss after 8s
  useEffect(() => {
    if (!overwriteToast) return
    const timer = setTimeout(() => setOverwriteToast(null), 8000)
    return () => clearTimeout(timer)
  }, [overwriteToast, setOverwriteToast])

  if (!overwriteToast) return null

  const { title, style, accentColor, pdfOptions, duplicateId, songs } = overwriteToast

  async function onYes() {
    const newId = await saveCanconer(title, style, accentColor, pdfOptions, songs, duplicateId)
    if (newId != null) {
      markSaved(newId)
      toast(t.app.songbook.overwriteToast.toastGuardat)
    } else {
      toast(t.app.songbook.overwriteToast.toastErrorGuardant, { type: "error" })
    }
    setOverwriteToast(null)
  }

  function onNo() {
    setOverwriteToast(null)
  }

  return (
    <div id="overwrite-toast" className="overwrite-toast">
      <span>⚠️</span>
      <p>
        {t.app.songbook.overwriteToast.missatgePrefix}
        <strong>&quot;{title}&quot;</strong>
        {t.app.songbook.overwriteToast.missatgeSufix}
      </p>
      <button id="ow-yes" className="btn-primary btn-sm" onClick={onYes}>
        {t.app.songbook.overwriteToast.sobreescriu}
      </button>
      <button id="ow-no" className="btn-ghost" onClick={onNo}>
        {t.app.songbook.overwriteToast.cancellar}
      </button>
    </div>
  )
}
