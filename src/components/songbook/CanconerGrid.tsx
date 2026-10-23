"use client"
import { useSongbookStore } from "@/hooks/useSongbook"
import { transposeKey, respellAccidentals } from "@/lib/transpose"
import { getT } from "@/lib/i18n"
import { IconX } from "@/components/shared/Icons"
import { ArrangeButton } from "./CanconerList"

export function CanconerGrid() {
  const t = getT()
  const canconer = useSongbookStore((s) => s.canconer)
  const selectedIdx = useSongbookStore((s) => s.selectedIdx)
  const setSelectedIdx = useSongbookStore((s) => s.setSelectedIdx)
  const openKeyMenu = useSongbookStore((s) => s.openKeyMenu)
  const remove = useSongbookStore((s) => s.removeFromCanconer)
  const openArrange = useSongbookStore((s) => s.openArrange)
  const notation = useSongbookStore((s) => s.pdfOptions.notation)

  return (
    <div id="canconer-grid">
      {canconer.map((entry, idx) => {
        const currentKey = respellAccidentals(transposeKey(entry.song.key, entry.semitones), notation)
        const isSelected = selectedIdx === idx
        return (
          <div
            key={entry.song.id}
            className={`cg-item${isSelected ? " selected" : ""}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(".cg-key, .cg-remove, .cg-arrange")) return
              setSelectedIdx(idx)
            }}
          >
            <span className="cg-num">{idx + 1}</span>
            <span className="cg-title">
              <span className="c-title-text">{entry.song.title}</span>
              {entry.arrangement && (
                <span className="song-kind-tag song-kind-arrangement">{t.app.songbook.songList.tipus.arrangement}</span>
              )}
            </span>
            <span className="cg-artist">{entry.song.artist}</span>
            <ArrangeButton entry={entry} onOpen={() => openArrange(idx)} className="cg-arrange" />
            <span
              className="cg-key"
              title={t.app.songbook.canconerGrid.canviarTonalitatTitle}
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
              title={t.app.songbook.canconerGrid.treureTitle}
              onClick={(e) => {
                e.stopPropagation()
                remove(idx)
              }}
              aria-label={t.app.songbook.canconerGrid.treureTitle}
            >
              <IconX />
            </button>
          </div>
        )
      })}
    </div>
  )
}
