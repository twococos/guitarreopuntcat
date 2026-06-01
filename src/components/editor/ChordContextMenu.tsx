"use client"

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { chordsByFunction, CHORD_MODIFIERS, applyModifier, stripModifier } from "@/lib/editor/chordFunctions"
import type { ChordModifier } from "@/lib/editor/chordFunctions"
import { getT } from "@/lib/i18n"

interface ChordMenuProps {
  open: boolean
  x: number
  y: number
  mode: "insert" | "modify"
  chordKey: string
  currentChord?: string
  onInsert: (chord: string) => void
  onModify: (newChord: string) => void
  onDelete: () => void
  onClose: () => void
}

// "-" representa el modificador buit (cap modificador aplicat).
type ActiveMod = "-" | ChordModifier

export function ChordContextMenu({
  open,
  x,
  y,
  mode,
  chordKey,
  currentChord,
  onInsert,
  onModify,
  onDelete,
  onClose,
}: ChordMenuProps): ReactNode {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [visible, setVisible] = useState(false)

  // Modificador actiu: "-" significa cap modificador. Sempre n'hi ha un.
  // Es manté seleccionat entre clics i no es perd en inserir un acord.
  const [activeMod, setActiveMod] = useState<ActiveMod>("-")

  // En obrir el menú en mode modify, sincronitzem el modificador amb el de
  // l'acord actual perquè l'usuari vegi quin està aplicat.
  useEffect(() => {
    if (!open) return
    if (mode === "modify" && currentChord) {
      const base = stripModifier(currentChord)
      const suffix = currentChord.slice(base.length)
      // El suffix pot ser "" (cap mod), "maj7", "7", "sus2", "m7" si la base no és menor, etc.
      if (suffix === "") {
        setActiveMod("-")
      } else if ((CHORD_MODIFIERS as readonly string[]).includes(suffix)) {
        setActiveMod(suffix as ChordModifier)
      } else {
        // Modificador no reconegut: mantenim el que hi havia.
      }
    }
  }, [open, mode, currentChord])

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    setVisible(false)
    const mw = menuRef.current.offsetWidth
    const mh = menuRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = x + mw > vw ? vw - mw - 8 : x
    const top = y + mh > vh ? vh - mh - 8 : y
    setPos({ left, top })
    setVisible(true)
  }, [open, x, y])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      // Si el click és dins el menú, no tanquem. Necessari perquè els
      // botons de modificador no tanquin el menú en mode insert.
      const m = menuRef.current
      if (m && e.target instanceof Node && m.contains(e.target)) return
      onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    // Registrem el listener al següent tick perquè el click que ha obert
    // el menú (mateix gest, mateix tick) no el tanqui immediatament.
    const id = window.setTimeout(() => {
      document.addEventListener("click", onDocClick)
    }, 0)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener("click", onDocClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const t = getT()

  const { tonic, subdominant, dominant, chromatic } = chordsByFunction(chordKey)

  // Clic sobre un acord: aplica el modificador actiu i tanca el menú.
  // El modificador es manté seleccionat per a la pròxima obertura.
  function handleChordMouseDown(e: React.MouseEvent, chord: string) {
    e.preventDefault()
    const finalChord = activeMod === "-" ? chord : applyModifier(chord, activeMod)
    if (mode === "modify") {
      onModify(finalChord)
    } else {
      onInsert(finalChord)
    }
    onClose()
  }

  // Clic sobre un modificador: NO tanca el menú.
  // - En mode insert: només selecciona el modificador actiu.
  // - En mode modify: aplica el modificador immediatament a l'acord en edició
  //   (el modificador és el que es canvia més sovint).
  function handleModifierMouseDown(e: React.MouseEvent, mod: ActiveMod) {
    e.preventDefault()
    e.stopPropagation()
    setActiveMod(mod)

    if (mode === "modify" && currentChord) {
      const base = stripModifier(currentChord)
      const newChord = mod === "-" ? base : applyModifier(base, mod)
      onModify(newChord)
    }
  }

  function handleDeleteMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    onDelete()
    onClose()
  }

  const modeClass =
    mode === "insert" ? "chord-menu-mode-insert" : "chord-menu-mode-modify"

  // Layout d'acords del to en graella 3 columnes (segons exemple per a C):
  //   Fila 1: I            IV            V
  //   Fila 2: vi (tònica)  ii (subdom.)  iii (dominant)
  //   Fila 3: (buit)       (buit)        vii° (Bdim)
  // En menor: equivalent amb i, iv, V / III, VI, VII / -, ii°, -
  const t0 = tonic[0] ?? "" // I o i
  const t1 = tonic[1] ?? "" // vi o III
  const s0 = subdominant[0] ?? "" // IV o iv
  const s1 = subdominant[1] ?? "" // ii o VI
  const d0 = dominant[0] ?? "" // V o V
  const d1 = dominant[1] ?? "" // iii o VII
  const d2 = dominant[2] ?? "" // vii° o ii°

  // Layout cromàtic en graella 3 columnes (3 files x 3 cols = 9 sostinguts/bemolls)
  // chromatic conté primer els majors (no del to) i després els menors. Per a la
  // graella compacta agafem els 9 acords cromàtics (que no són al to).
  const chromaticGrid = chromatic.slice(0, 9)

  // Modificadors per a la graella 4 files x 3 columnes (12 cel·les + "-" inicial).
  // Layout segons l'exemple de l'usuari:
  //   Fila 1: -       7       maj7
  //   Fila 2: sus2    sus4    add9
  //   Fila 3: 6       dim     m7b5
  //   Fila 4: 9       13      aug
  const modifierGrid: ActiveMod[] = [
    "-", "7", "maj7",
    "sus2", "sus4", "add9",
    "6", "dim", "m7b5",
    "9", "13", "aug",
  ]

  const modifierBlock = (
    <>
      <div className="chord-menu-section-label">{t.editor.chordMenu.modificador}</div>
      <div className="chord-grid-3">
        {modifierGrid.map((mod) => (
          <button
            key={mod}
            className={`chord-modifier-chip${activeMod === mod ? " active" : ""}`}
            onMouseDown={(e) => handleModifierMouseDown(e, mod)}
            onClick={(e) => e.stopPropagation()}
          >
            {mod}
          </button>
        ))}
      </div>
    </>
  )

  const tonalBlock = (
    <>
      <div className="chord-menu-section-label">{t.editor.chordMenu.acordsDelTo}</div>
      <div className="chord-grid-3">
        {/* Fila 1: tònica primària, subdominant primària, dominant primària */}
        <ChordCell chord={t0} onClick={handleChordMouseDown} />
        <ChordCell chord={s0} onClick={handleChordMouseDown} />
        <ChordCell chord={d0} onClick={handleChordMouseDown} />
        {/* Fila 2: tònica secundària, subdominant secundària, dominant secundària */}
        <ChordCell chord={t1} onClick={handleChordMouseDown} />
        <ChordCell chord={s1} onClick={handleChordMouseDown} />
        <ChordCell chord={d1} onClick={handleChordMouseDown} />
        {/* Fila 3: només dominant terciària (vii° o ii°) */}
        <span />
        <span />
        <ChordCell chord={d2} onClick={handleChordMouseDown} />
      </div>

      {chromaticGrid.length > 0 && (
        <>
          <div className="chord-menu-section-label">{t.editor.chordMenu.cromatics}</div>
          <div className="chord-grid-3">
            {chromaticGrid.map((c) => (
              <ChordCell key={c} chord={c} onClick={handleChordMouseDown} />
            ))}
          </div>
        </>
      )}
    </>
  )

  return (
    <div
      className={`chord-menu chord-menu-compact ${modeClass}`}
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        visibility: visible ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {mode === "modify" ? (
        <>
          {/* Mode modify: eliminar a dalt, després modificadors (acció més
              habitual quan ja hi ha un acord), després els acords del to. */}
          <button
            className="chord-menu-delete-btn"
            onMouseDown={handleDeleteMouseDown}
          >
            {t.editor.chordMenu.eliminarAcord}
          </button>
          <hr className="chord-menu-sep" />
          {modifierBlock}
          {tonalBlock}
        </>
      ) : (
        <>
          {/* Mode insert: primer els acords del to, després el modificador
              actiu que s'aplicarà al pròxim clic d'acord. */}
          {tonalBlock}
          {modifierBlock}
        </>
      )}
    </div>
  )
}

// Cel·la d'acord: si chord és buit, ocupa l'espai però no és clicable.
function ChordCell({
  chord,
  onClick,
}: {
  chord: string
  onClick: (e: React.MouseEvent, chord: string) => void
}): ReactNode {
  if (!chord) return <span />
  return (
    <button
      className="chord-menu-chord-btn"
      onMouseDown={(e) => onClick(e, chord)}
    >
      {chord}
    </button>
  )
}
