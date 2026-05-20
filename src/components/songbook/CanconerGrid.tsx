"use client"
import { useSongbookStore } from "@/hooks/useSongbook"
import { transposeKey } from "@/lib/transpose"

export function CanconerGrid() {
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const setSelectedIdx = useSongbookStore((s) => s.setSelectedIdx)
  const bump = useSongbookStore((s) => s.bumpSemitones)
  const openKeyMenu = useSongbookStore((s) => s.openKeyMenu)

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
              if ((e.target as HTMLElement).closest(".cg-transpose")) return
              setSelectedIdx(idx)
            }}
          >
            <span className="cg-num">{idx + 1}</span>
            <span className="cg-title">{entry.song.title}</span>
            <span className="cg-artist">{entry.song.artist}</span>
            <div className="cg-transpose">
              <button
                className="cg-pm cg-btn-down"
                onClick={(e) => {
                  e.stopPropagation()
                  bump(idx, -1)
                }}
              >
                −
              </button>
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
                className="cg-pm cg-btn-up"
                onClick={(e) => {
                  e.stopPropagation()
                  bump(idx, 1)
                }}
              >
                +
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
