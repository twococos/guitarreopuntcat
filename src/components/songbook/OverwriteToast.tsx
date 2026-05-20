"use client"
import { useEffect } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { useToastStore } from "@/hooks/useToasts"
import { saveCanconer } from "@/lib/canconerApi"

export function OverwriteToast() {
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

  const { title, style, accentColor, duplicateId, songs } = overwriteToast

  async function onYes() {
    const newId = await saveCanconer(title, style, accentColor, songs, duplicateId)
    if (newId != null) {
      markSaved(newId)
      toast("Cançoner guardat!")
    } else {
      toast("Error guardant el cançoner", { type: "error" })
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
        Ja tens un cançoner <strong>&quot;{title}&quot;</strong>. Vols sobreescriure&apos;l?
      </p>
      <button id="ow-yes" className="btn-primary btn-sm" onClick={onYes}>
        Sobreescriu
      </button>
      <button id="ow-no" className="btn-ghost" onClick={onNo}>
        Cancel·lar
      </button>
    </div>
  )
}
