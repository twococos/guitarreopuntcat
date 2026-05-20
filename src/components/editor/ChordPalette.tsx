"use client"
import { chordsForKey } from "@/lib/transpose"

interface ChordPaletteProps {
  chordKey: string
  onInsert: (chord: string) => void
}

export function ChordPalette({ chordKey, onInsert }: ChordPaletteProps) {
  const { diatonic, secondary } = chordsForKey(chordKey)
  const chords = [...diatonic, ...secondary]

  return (
    <div id="chord-palette">
      {chords.map((chord) => (
        <button key={chord} className="chip" onClick={() => onInsert(chord)}>
          {chord}
        </button>
      ))}
    </div>
  )
}
