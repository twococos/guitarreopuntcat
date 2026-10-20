"use client"
import { useState } from "react"
import { useSongbookStore, isDefaultCanconerTitle } from "@/hooks/useSongbook"

/**
 * Camp del títol del cançoner. N'hi ha dos (capçalera del cançoner i
 * panell d'opcions) que llegeixen i escriuen el mateix store.
 */
export function CanconerTitleInput({
  id,
  className,
  ariaLabel,
}: {
  id?: string
  className: string
  ariaLabel?: string
}) {
  const canconerTitle = useSongbookStore((s) => s.canconerTitle)
  const provisionalTitle = useSongbookStore((s) => s.provisionalTitle)
  const setCanconerTitle = useSongbookStore((s) => s.setCanconerTitle)
  // Mentre el camp té focus mostrem el text "buit" perquè el placeholder
  // (el títol provisional) faci de hint. En perdre focus, si l'usuari no
  // ha escrit res, restaurem el provisional perquè mai s'arribi a guardar
  // sense nom.
  const [titleFocused, setTitleFocused] = useState(false)

  const titleIsProvisional = canconerTitle === provisionalTitle
  // El títol "provisional" s'estila en gris (com un placeholder permanent).
  const titleIsDefault = titleIsProvisional || isDefaultCanconerTitle(canconerTitle)
  const displayedTitle = titleFocused && titleIsProvisional ? "" : canconerTitle

  return (
    <input
      type="text"
      id={id}
      className={`${className}${titleIsDefault ? " is-default" : ""}`}
      placeholder={provisionalTitle}
      aria-label={ariaLabel}
      value={displayedTitle}
      onChange={(e) => setCanconerTitle(e.target.value)}
      onFocus={() => setTitleFocused(true)}
      onBlur={() => {
        setTitleFocused(false)
        // Si l'usuari l'ha deixat buit, restaura el provisional perquè
        // mai pugui quedar el camp sense nom.
        if (canconerTitle.trim() === "") {
          setCanconerTitle(provisionalTitle)
        }
      }}
    />
  )
}
