"use client"
import { useSongbookStore } from "@/hooks/useSongbook"
import { BookPreview } from "./BookPreview"
import { PdfDownloadButton } from "./PdfDownloadButton"
import { OptionsPanel } from "./options/OptionsPanel"
import { getT } from "@/lib/i18n"
import { IconEye, IconSettings } from "@/components/shared/Icons"

/* ── DetailPanel ───────────────────────────────────────────── */

export function DetailPanel() {
  const t = getT()
  const previewActive = useSongbookStore((s) => s.previewActive)
  const optionsOpen = useSongbookStore((s) => s.optionsOpen)
  const setOptionsOpen = useSongbookStore((s) => s.setOptionsOpen)

  return (
    <>
      <section id="panel-detail">
        {previewActive && (
          <div id="panel-detail-inner">
            <div className="detail-tabs">
              <h2 className="detail-title">
                <IconEye /> {t.app.songbook.detailPanel.titolPrevia}
              </h2>
              <PdfDownloadButton variant="preview" />
              {/* Toggle del panell flotant «Opcions i format»; actiu es
                  marca en vermell. */}
              <button
                type="button"
                className={`detail-tab is-toggle${optionsOpen ? " toggled" : ""}`}
                onClick={() => setOptionsOpen(!optionsOpen)}
                aria-pressed={optionsOpen}
              >
                <IconSettings /> {t.app.songbook.detailPanel.tabOpcionsFormat}
              </button>
            </div>
            <BookPreview />
          </div>
        )}
      </section>
      {optionsOpen && previewActive && <OptionsPanel onClose={() => setOptionsOpen(false)} />}
    </>
  )
}

/** Botó flotant per plegar/desplegar la vista prèvia, posicionat
 *  per fora de `#panel-detail` (que té `overflow:auto` i el tallaria).
 *  Quan està plegat, el seu CSS el converteix en `position: fixed` per
 *  flotar a la cantonada dreta del viewport. */
export function PreviewToggleButton() {
  const t = getT()
  const previewActive = useSongbookStore((s) => s.previewActive)
  const togglePreviewActive = useSongbookStore((s) => s.togglePreviewActive)
  return (
    <button
      id="btn-collapse-panel"
      className={`preview-toggle${previewActive ? "" : " collapsed"}`}
      title={previewActive ? t.app.songbook.detailPanel.amagarVistaPreviа : t.app.songbook.detailPanel.mostrarVistaPreviа}
      onClick={togglePreviewActive}
    >
      <span id="collapse-arrow">{previewActive ? "›" : "‹"}</span>
    </button>
  )
}
