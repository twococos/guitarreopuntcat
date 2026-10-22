"use client"
import { IconChevronRight } from "@/components/shared/Icons"
import type { ReactElement } from "react"

export interface AccordionCategory<Id extends string> {
  id: Id
  title: string
  Body: () => ReactElement
}

/** Acordió de categories d'opcions: com a molt una d'oberta; tornar a
 *  clicar l'oberta la plega (`onOpen(null)`). El fan servir el panell
 *  «Opcions i format» de /app i el diàleg de PDF públic. */
export function OptionsAccordion<Id extends string>({
  categories,
  openId,
  onOpen,
}: {
  categories: AccordionCategory<Id>[]
  openId: Id | null
  onOpen: (id: Id | null) => void
}) {
  return (
    <>
      {categories.map(({ id, title, Body }) => {
        const open = id === openId
        return (
          <div key={id} className={`opt-cat${open ? " is-open" : ""}`}>
            <button
              type="button"
              className="opt-cat-head"
              aria-expanded={open}
              aria-controls={`opt-cat-${id}`}
              onClick={() => onOpen(open ? null : id)}
            >
              <span className="opt-cat-title">{title}</span>
              <IconChevronRight className="opt-cat-chevron" />
            </button>
            <div className="opt-cat-body" id={`opt-cat-${id}`} role="region" aria-hidden={!open} inert={!open}>
              <div className="opt-cat-inner">
                <Body />
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
