"use client"
import { useSongbookStore } from "@/hooks/useSongbook"
import { transposeKey } from "@/lib/transpose"

export function CanconerGrid() {
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const setSelectedIdx = useSongbookStore((s) => s.setSelectedIdx)
  const openKeyMenu = useSongbookStore((s) => s.openKeyMenu)
  const remove = useSongbookStore((s) => s.removeFromCanconer)

  return (
    <div id="canconer-grid">
      {canconer.map((entry, idx) => {
        const currentKey = transposeKey(entry.song.key, entry.semitones)
        const isSelected = selectedIdx === idx
        return (
          <div
            key={entry.song.id}
            className={`cg-item${isSelected ? " selected" : ""}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(".cg-key, .cg-remove")) return
              setSelectedIdx(idx)
            }}
          >
            <span className="cg-num">{idx + 1}</span>
            <span className="cg-title">{entry.song.title}</span>
            <span className="cg-artist">{entry.song.artist}</span>
            <span
              className="cg-key"
              title="Canviar tonalitat"
              onClick={(e) => {
                e.stopPropagation()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                openKeyMenu(idx, {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                })
              }}
            >
              {currentKey}
            </span>
            <button
              className="cg-remove"
              title="Treure"
              onClick={(e) => {
                e.stopPropagation()
                remove(idx)
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
