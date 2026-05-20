"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useSongbookStore } from "@/hooks/useSongbook"
import { CHROMATIC } from "@/lib/transpose"
import { transposeKey } from "@/lib/transpose"

export function KeyMenu() {
  const keyMenu = useSongbookStore((s) => s.keyMenu)
  const canconer = useSongbookStore((s) => s.canconer)
  const setSemitones = useSongbookStore((s) => s.setSemitones)
  const closeKeyMenu = useSongbookStore((s) => s.closeKeyMenu)

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!keyMenu || !menuRef.current) return
    const { anchorRect } = keyMenu
    const menuH = menuRef.current.offsetHeight
    const menuW = menuRef.current.offsetWidth
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = anchorRect.bottom + 4
    if (top + menuH > vh) top = anchorRect.top - menuH - 4

    let left = anchorRect.left
    if (left + menuW > vw) left = vw - menuW - 8

    setPos({ left, top })
  }, [keyMenu])

  useEffect(() => {
    if (!keyMenu) return

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeKeyMenu()
    }
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeKeyMenu()
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDocClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDocClick)
    }
  }, [keyMenu, closeKeyMenu])

  if (!keyMenu) return null

  const entry = canconer[keyMenu.idx]
  if (!entry) return null

  const originalKey = entry.song.key
  const isMinor = originalKey.endsWith("m") && originalKey !== "F" && originalKey !== "C"

  // Genera les 12 tonalitats del mateix mode que la cançó
  const keysForSong = (CHROMATIC as readonly string[]).map((note) =>
    isMinor ? note + "m" : note,
  )

  const currentKey = transposeKey(originalKey, entry.semitones)

  function onSelectKey(targetKey: string) {
    if (!keyMenu) return
    const targetRoot = targetKey.replace("m", "")
    const origRoot = originalKey.replace("m", "")
    const iTarget = (CHROMATIC as readonly string[]).indexOf(targetRoot)
    const iOrig = (CHROMATIC as readonly string[]).indexOf(origRoot)
    if (iTarget === -1 || iOrig === -1) return
    const semitones = ((iTarget - iOrig) % 12 + 12) % 12
    setSemitones(keyMenu.idx, semitones)
    closeKeyMenu()
  }

  return (
    <div
      id="key-menu"
      ref={menuRef}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1000 }}
    >
      <div className="key-menu-title">Canviar tonalitat</div>
      <div className="key-menu-grid" id="key-menu-grid">
        {keysForSong.map((k) => (
          <button
            key={k}
            className={k === currentKey ? "current" : ""}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelectKey(k)
            }}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
