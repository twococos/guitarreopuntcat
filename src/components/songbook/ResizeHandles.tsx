"use client"
import { useCallback, useEffect, useRef } from "react"
import {
  useColumnSizesStore,
  LEFT_MIN,
  LEFT_MAX,
  RIGHT_MIN,
  RIGHT_MAX,
} from "@/hooks/useColumnSizes"
import { useSongbookStore } from "@/hooks/useSongbook"
import { getT } from "@/lib/i18n"

/**
 * Dos handles invisibles posicionats sobre les vores de les columnes
 * esquerra i dreta del `#main-layout`. Permeten arrossegar per
 * redimensionar (clamp dins els límits del store).
 *
 * Si la vista prèvia està plegada, el handle dret queda desactivat
 * (la columna no és visible).
 */
export function ResizeHandles() {
  const t = getT()
  const leftWidth = useColumnSizesStore((s) => s.leftWidth)
  const rightWidth = useColumnSizesStore((s) => s.rightWidth)
  const setLeftWidth = useColumnSizesStore((s) => s.setLeftWidth)
  const setRightWidth = useColumnSizesStore((s) => s.setRightWidth)
  const previewActive = useSongbookStore((s) => s.previewActive)

  const draggingRef = useRef<"left" | "right" | null>(null)

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const which = draggingRef.current
      if (!which) return
      const main = document.getElementById("main-layout")
      if (!main) return
      const rect = main.getBoundingClientRect()

      if (which === "left") {
        const next = e.clientX - rect.left
        setLeftWidth(next)
      } else {
        const rightPx = rect.right - e.clientX
        const pct = (rightPx / rect.width) * 100
        setRightWidth(pct)
      }
    },
    [setLeftWidth, setRightWidth],
  )

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    window.removeEventListener("mousemove", onMouseMove)
    window.removeEventListener("mouseup", onMouseUp)
  }, [onMouseMove])

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  function startDrag(which: "left" | "right") {
    return (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = which
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    }
  }

  return (
    <>
      <div
        className="resize-handle resize-handle-left"
        style={{ left: leftWidth - 3 }}
        title={t.app.songbook.resizeHandles.ampladadaCercador(LEFT_MIN, LEFT_MAX)}
        onMouseDown={startDrag("left")}
      />
      {previewActive && (
        <div
          className="resize-handle resize-handle-right"
          style={{ right: `calc(${rightWidth}% - 3px)` }}
          title={t.app.songbook.resizeHandles.ampladaVistaPreviа(RIGHT_MIN, RIGHT_MAX)}
          onMouseDown={startDrag("right")}
        />
      )}
    </>
  )
}
