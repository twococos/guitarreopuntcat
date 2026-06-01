"use client"

import { getT } from "@/lib/i18n"

interface ProposeInfoPopupProps {
  onAccept: () => void
}

export function ProposeInfoPopup({ onAccept }: ProposeInfoPopupProps) {
  const t = getT()
  return (
    <div id="propose-info-overlay">
      <div id="propose-info-box">
        <div id="propose-info-logo">🎵</div>
        <h2>{t.editor.propose.titol}</h2>
        <p>{t.editor.propose.descripcio}</p>
        <ul>
          <li>
            🎵 {t.editor.propose.reqFidedignes}
          </li>
          <li>🎸 {t.editor.propose.reqTonalitat}</li>
          <li>
            📋 {t.editor.propose.reqCompletaPrefix}{" "}
            <strong>{t.editor.propose.reqCompletaForta}</strong>
            {t.editor.propose.reqCompletaSufix}
          </li>
          <li>✅ {t.editor.propose.reqRevisio}</li>
        </ul>
        <button id="btn-propose-accept" className="btn-primary" onClick={onAccept}>
          {t.editor.propose.hoEntenc}
        </button>
      </div>
    </div>
  )
}
