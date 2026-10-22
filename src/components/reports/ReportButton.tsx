"use client"
import { useEffect, useState } from "react"
import { getT } from "@/lib/i18n"
import { IconFlag } from "@/components/shared/Icons"

/** Alçada de la nav pública (és sticky: la seva vora inferior és a la pantalla). */
export function navBottom(): number {
  return document.querySelector("header.public-nav")?.getBoundingClientRect().bottom ?? 0
}

/**
 * Botó «Reporta un error», just sota la línia de la capçalera de la cançó i
 * alineat a la dreta. És sticky dins la targeta: quan en faríem scroll fora,
 * es queda ancorat a dalt de la pantalla (sota la nav) fins que s'acaba la
 * targeta. Ha de ser fill directe de la targeta perquè el sticky hi arribi.
 */
export function ReportButton({ onClick, hidden }: { onClick: () => void; hidden: boolean }) {
  const t = getT().public.report
  const [top, setTop] = useState(12)

  useEffect(() => {
    setTop(navBottom() + 12)
  }, [])

  return (
    <div className="rp-trigger-row" style={{ top }}>
      <button
        type="button"
        className="rp-trigger"
        onClick={onClick}
        title={t.boto}
        style={hidden ? { visibility: "hidden" } : undefined}
      >
        <IconFlag />
        <span className="rp-trigger-label">{t.boto}</span>
      </button>
    </div>
  )
}
