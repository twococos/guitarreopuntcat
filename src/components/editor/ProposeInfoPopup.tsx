"use client"

import { getT } from "@/lib/i18n"
import {
  IconMusic,
  IconGuitar,
  IconClipboard,
  IconCheckCircle,
} from "@/components/shared/Icons"

interface ProposeInfoPopupProps {
  onAccept: () => void
}

export function ProposeInfoPopup({ onAccept }: ProposeInfoPopupProps) {
  const t = getT()
  return (
    <div id="propose-info-overlay">
      <div id="propose-info-box">
        <div id="propose-info-logo"><IconMusic /></div>
        <h2>{t.editor.propose.titol}</h2>
        <p>{t.editor.propose.descripcio}</p>
        <ul>
          <li>
            <IconMusic /> {t.editor.propose.reqFidedignes}
          </li>
          <li><IconGuitar /> {t.editor.propose.reqTonalitat}</li>
          <li>
            <IconClipboard /> {t.editor.propose.reqCompletaPrefix}{" "}
            <strong>{t.editor.propose.reqCompletaForta}</strong>
            {t.editor.propose.reqCompletaSufix}
          </li>
          <li><IconCheckCircle /> {t.editor.propose.reqRevisio}</li>
        </ul>
        <button id="btn-propose-accept" className="btn-primary" onClick={onAccept}>
          {t.editor.propose.hoEntenc}
        </button>
      </div>
    </div>
  )
}
