"use client"

/**
 * Importació massiva de cançons (només admin, només via URL directa).
 *
 * Flux:
 *  1. L'usuari deixa anar un .csv (drag & drop o picker).
 *  2. Es parseja en local i es mostra una previsualització + botó "Importar".
 *  3. En clicar "Importar", s'envien les files al servidor (/api/admin/import-bulk)
 *     i es llegeix l'stream SSE per actualitzar l'estat de cada fila.
 *  4. Quan acaba, apareix el botó "Nova importació" que retorna a l'inici.
 *
 * Format CSV esperat (sense capçalera):
 *   link, títol, artista, [àlbum], [any], [youtube], [spotify], [idioma], [tags]
 *
 * link, títol i artista són obligatoris. La resta poden estar buits.
 * Les tags poden contenir comes si es posen entre cometes dobles: "rock,pop".
 */

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useToastStore } from "@/hooks/useToasts"
import { isSupportedUrl } from "@/lib/importers"

type RowStatus = "pending" | "running" | "ok" | "error" | "duplicate"

interface ParsedRow {
  url: string
  title: string
  artist: string
  album: string | null
  year: string | null
  youtubeUrl: string | null
  spotifyUrl: string | null
  language: string | null
  tags: string | null
}

interface RowState extends ParsedRow {
  status: RowStatus
  error?: string
  songId?: number
}

type Phase = "idle" | "preview" | "importing" | "done"

// Camps configurables com a obligatoris (els tres primers — url/title/artist —
// ho són sempre i no es poden desmarcar).
type OptionalField =
  | "album"
  | "year"
  | "youtubeUrl"
  | "spotifyUrl"
  | "language"
  | "tags"

const OPTIONAL_FIELDS: { key: OptionalField; label: string }[] = [
  { key: "album", label: "Àlbum" },
  { key: "year", label: "Any" },
  { key: "youtubeUrl", label: "YouTube" },
  { key: "spotifyUrl", label: "Spotify" },
  { key: "language", label: "Idioma" },
  { key: "tags", label: "Etiquetes" },
]

interface ScrapedSong {
  url: string
  title: string
  album?: string
  year?: number
}

interface ScrapeResponse {
  source: string
  artist: string
  songs: ScrapedSong[]
}

export default function ImportMassiuPage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [requiredFields, setRequiredFields] = useState<Set<OptionalField>>(
    () => new Set(),
  )
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useToastStore((s) => s.show)

  // Override "importar igualment" per fila (índexs)
  const [overrideIndexes, setOverrideIndexes] = useState<Set<number>>(
    () => new Set(),
  )

  // Cercador de links que falten
  const [findingLinks, setFindingLinks] = useState(false)
  const [findProgress, setFindProgress] = useState({ done: 0, total: 0 })

  // Plegar/desplegar la llista de cançons
  const [listCollapsed, setListCollapsed] = useState(false)

  // Generador de CSV des d'una pàgina d'artista
  const [scrapeUrl, setScrapeUrl] = useState("")
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResponse | null>(null)
  const [scrapeCsv, setScrapeCsv] = useState("")
  const [scrapeError, setScrapeError] = useState<string | null>(null)

  const totals = useMemo(() => {
    let ok = 0
    let err = 0
    let dup = 0
    let pending = 0
    let running = 0
    for (const r of rows) {
      if (r.status === "ok") ok++
      else if (r.status === "error") err++
      else if (r.status === "duplicate") dup++
      else if (r.status === "running") running++
      else pending++
    }
    return { ok, err, dup, pending, running, total: rows.length }
  }, [rows])

  const handleFile = useCallback(
    async (f: File) => {
      setParseError(null)
      if (!f.name.toLowerCase().endsWith(".csv")) {
        setParseError("L'arxiu ha de tenir extensió .csv")
        return
      }
      try {
        const text = await f.text()
        const parsed = parseCsv(text)
        if (parsed.length === 0) {
          setParseError("El CSV no conté cap fila vàlida.")
          return
        }
        setFile(f)
        setRows(parsed.map((p) => ({ ...p, status: "pending" as RowStatus })))
        setPhase("preview")
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al llegir l'arxiu"
        setParseError(msg)
      }
    },
    [],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const f = e.dataTransfer.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  const onPickClick = () => fileInputRef.current?.click()
  const onPickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ""
  }

  const startImport = useCallback(async () => {
    setPhase("importing")
    // Reset estats per si es repeteix
    setRows((prev) => prev.map((r) => ({ ...r, status: "pending", error: undefined, songId: undefined })))

    try {
      const payload = {
        rows: rows.map((r) => ({
          url: r.url,
          title: r.title,
          artist: r.artist,
          album: r.album,
          year: r.year,
          youtubeUrl: r.youtubeUrl,
          spotifyUrl: r.spotifyUrl,
          language: r.language,
          tags: r.tags,
        })),
        required: Array.from(requiredFields),
        skipRequiredIndexes: Array.from(overrideIndexes),
      }

      const res = await fetch("/api/admin/import-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "")
        toast(`Error del servidor: ${res.status} ${txt}`.trim(), { type: "error" })
        setPhase("preview")
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE: events separats per "\n\n", cada línia comença per "data: "
        let sep
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const line = chunk.split("\n").find((l) => l.startsWith("data: "))
          if (!line) continue
          try {
            const ev = JSON.parse(line.slice(6)) as
              | { type: "progress"; index: number; status: RowStatus; error?: string; songId?: number }
              | { type: "done" }

            if (ev.type === "progress") {
              setRows((prev) => {
                const next = prev.slice()
                if (next[ev.index]) {
                  next[ev.index] = {
                    ...next[ev.index],
                    status: ev.status,
                    error: ev.error,
                    songId: ev.songId,
                  }
                }
                return next
              })
            } else if (ev.type === "done") {
              setPhase("done")
            }
          } catch {
            // Ignora línies malformades
          }
        }
      }

      // Si el stream s'ha tancat sense "done" explícit
      setPhase((p) => (p === "importing" ? "done" : p))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de xarxa"
      toast(msg, { type: "error" })
      setPhase("preview")
    }
  }, [rows, requiredFields, overrideIndexes, toast])

  const resetAll = () => {
    setPhase("idle")
    setFile(null)
    setRows([])
    setParseError(null)
    setRequiredFields(new Set())
    setOverrideIndexes(new Set())
    setFindProgress({ done: 0, total: 0 })
  }

  const toggleRequired = (key: OptionalField) => {
    setRequiredFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const findMissingLinks = useCallback(async () => {
    if (rows.length === 0) return
    setFindingLinks(true)
    setFindProgress({ done: 0, total: rows.length })
    try {
      const payload = {
        rows: rows.map((r) => ({
          title: r.title,
          artist: r.artist,
          hasYoutube: !!r.youtubeUrl && r.youtubeUrl.trim().length > 0,
          hasSpotify: !!r.spotifyUrl && r.spotifyUrl.trim().length > 0,
        })),
      }
      const res = await fetch("/api/admin/find-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok || !res.body) {
        toast(`Error del servidor: ${res.status}`, { type: "error" })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let spotifyAvailable = true
      let done = 0
      let found = 0

      while (true) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })

        let sep
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const line = chunk.split("\n").find((l) => l.startsWith("data: "))
          if (!line) continue
          try {
            const ev = JSON.parse(line.slice(6)) as
              | { type: "meta"; spotifyAvailable: boolean }
              | {
                  type: "progress"
                  index: number
                  youtubeUrl?: string | null
                  spotifyUrl?: string | null
                }
              | { type: "done" }

            if (ev.type === "meta") {
              spotifyAvailable = ev.spotifyAvailable
              if (!spotifyAvailable) {
                toast(
                  "Spotify no configurat (falta SPOTIFY_CLIENT_ID/SECRET). Només es buscarà YouTube.",
                  { type: "info" },
                )
              }
            } else if (ev.type === "progress") {
              done++
              setFindProgress({ done, total: rows.length })
              setRows((prev) => {
                const next = prev.slice()
                const cur = next[ev.index]
                if (!cur) return prev
                const updated = { ...cur }
                if (ev.youtubeUrl) {
                  updated.youtubeUrl = ev.youtubeUrl
                  found++
                }
                if (ev.spotifyUrl) {
                  updated.spotifyUrl = ev.spotifyUrl
                  found++
                }
                next[ev.index] = updated
                return next
              })
            }
          } catch {
            // ignora línies malformades
          }
        }
      }

      toast(`Cerca acabada · ${found} links trobats`, { type: "success" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de xarxa"
      toast(msg, { type: "error" })
    } finally {
      setFindingLinks(false)
    }
  }, [rows, toast])

  const importRowAnyway = useCallback((index: number) => {
    setOverrideIndexes((prev) => {
      const next = new Set(prev)
      next.add(index)
      return next
    })
    setRows((prev) => {
      const next = prev.slice()
      if (next[index]) {
        next[index] = {
          ...next[index],
          status: "pending",
          error: undefined,
        }
      }
      return next
    })
  }, [])

  const runScrape = useCallback(async () => {
    setScrapeError(null)
    setScrapeResult(null)
    setScrapeCsv("")
    const url = scrapeUrl.trim()
    if (!url) {
      setScrapeError("Introdueix una URL.")
      return
    }
    setScrapeLoading(true)
    try {
      const res = await fetch("/api/admin/scrape-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json().catch(() => null)) as
        | (ScrapeResponse & { error?: never })
        | { error: string }
        | null
      if (!res.ok || !data || "error" in data) {
        const msg =
          data && "error" in data && data.error
            ? data.error
            : `Error del servidor (${res.status})`
        setScrapeError(msg)
        return
      }
      setScrapeResult(data)
      setScrapeCsv(buildCsvFromScrape(data))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de xarxa"
      setScrapeError(msg)
    } finally {
      setScrapeLoading(false)
    }
  }, [scrapeUrl])

  const copyScrapeCsv = useCallback(async () => {
    if (!scrapeCsv) return
    try {
      await navigator.clipboard.writeText(scrapeCsv)
      toast("Copiat al porta-retalls", { type: "success" })
    } catch {
      toast("No s'ha pogut copiar", { type: "error" })
    }
  }, [scrapeCsv, toast])

  const downloadScrapeCsv = useCallback(() => {
    if (!scrapeCsv || !scrapeResult) return
    const blob = new Blob([scrapeCsv], { type: "text/csv;charset=utf-8" })
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objUrl
    a.download = `${slugify(scrapeResult.artist)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
  }, [scrapeCsv, scrapeResult])

  const loadScrapeIntoQueue = useCallback(() => {
    if (!scrapeCsv) return
    try {
      const parsed = parseCsv(scrapeCsv)
      if (parsed.length === 0) {
        setScrapeError("El CSV generat és buit.")
        return
      }

      // Append a la cua existent amb dedup per URL (les que ja hi són no es
      // tornen a afegir; l'usuari pot fer servir el generador moltes vegades).
      let added = 0
      let skipped = 0
      setRows((prev) => {
        const existingUrls = new Set(prev.map((r) => r.url))
        const newOnes = parsed
          .filter((p) => {
            if (existingUrls.has(p.url)) {
              skipped++
              return false
            }
            existingUrls.add(p.url)
            return true
          })
          .map((p) => ({ ...p, status: "pending" as RowStatus }))
        added = newOnes.length
        return [...prev, ...newOnes]
      })

      // Si encara no hi ha file (primera càrrega des del generador), li posem
      // el nom de l'artista. Si ja n'hi havia un, el reemplacem per un nom
      // genèric que reflecteixi que la cua és mixta.
      setFile((prev) => {
        const artistName = scrapeResult?.artist ?? "artista"
        if (!prev) {
          return new File([scrapeCsv], `${slugify(artistName)}.csv`, {
            type: "text/csv",
          })
        }
        return new File([""], "cua-manual.csv", { type: "text/csv" })
      })

      setPhase("preview")
      // Neteja l'estat del generador perquè pugui fer-ne servir un altre
      setScrapeUrl("")
      setScrapeResult(null)
      setScrapeCsv("")
      setScrapeError(null)

      if (added === 0) {
        toast("Totes les cançons ja eren a la cua", { type: "info" })
      } else if (skipped > 0) {
        toast(
          `${added} cançons afegides · ${skipped} ja hi eren (omeses)`,
          { type: "success" },
        )
      } else {
        toast(`${added} cançons afegides a la cua`, { type: "success" })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al parsejar el CSV"
      setScrapeError(msg)
    }
  }, [scrapeCsv, scrapeResult, toast])

  const scrapePanel = (
    <div className="bulk-scrape-panel">
      <div className="bulk-scrape-header">
        <h2>🪄 Generador de CSV des d&apos;una pàgina d&apos;artista</h2>
        <p className="bulk-scrape-hint">
          Introdueix un link d&apos;un artista d&apos;acordscatala.cat
          (p. ex. <code>https://www.acordscatala.cat/ca/txarango</code>)
          i es generaran les files CSV de totes les cançons llistades.
          {phase === "preview" && (
            <> Les noves files s&apos;afegiran a la cua actual.</>
          )}
        </p>
      </div>

      <div className="bulk-scrape-row">
        <input
          type="url"
          placeholder="https://www.acordscatala.cat/ca/artista"
          value={scrapeUrl}
          onChange={(e) => setScrapeUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !scrapeLoading) runScrape()
          }}
          disabled={scrapeLoading}
        />
        <button
          className="btn-primary"
          onClick={runScrape}
          disabled={scrapeLoading || !scrapeUrl.trim()}
        >
          {scrapeLoading ? "Buscant…" : "Buscar"}
        </button>
      </div>

      {scrapeError && (
        <div className="bulk-error-banner">{scrapeError}</div>
      )}

      {scrapeResult && (
        <>
          <div className="bulk-scrape-meta">
            <strong>{scrapeResult.artist}</strong> · {scrapeResult.songs.length} cançons trobades
          </div>
          <textarea
            className="bulk-scrape-textarea"
            value={scrapeCsv}
            onChange={(e) => setScrapeCsv(e.target.value)}
            spellCheck={false}
            rows={Math.min(20, Math.max(6, scrapeResult.songs.length + 1))}
          />
          <div className="bulk-scrape-actions">
            <button className="btn-ghost" onClick={copyScrapeCsv}>
              Copiar
            </button>
            <button className="btn-ghost" onClick={downloadScrapeCsv}>
              Descarregar .csv
            </button>
            <button
              className="btn-primary"
              onClick={loadScrapeIntoQueue}
            >
              {phase === "preview" ? "Afegir a la cua" : "Carregar a la cua"}
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      <header>
        <Link href="/app/admin" className="back-link">
          ← Panell d&apos;administració
        </Link>
        <h1>📥 Importació massiva</h1>
        <p className="subtitle">
          Importa cançons des d&apos;un .csv. Es crearan propostes pendents de
          revisió a nom de l&apos;usuari «Importador».
        </p>
      </header>

      <div className="bulk-import-page">
        {phase === "idle" && (
          <>
            <div
              className={`bulk-dropzone ${isDragOver ? "is-dragover" : ""}`}
              onClick={onPickClick}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPickClick()
              }}
            >
              <div className="bulk-dropzone-icon">📄</div>
              <div className="bulk-dropzone-text">
                Arrossega el CSV aquí o fes clic per seleccionar-lo
              </div>
              <div className="bulk-dropzone-hint">
                Format: link, títol, artista, àlbum, any, youtube, spotify, idioma, etiquetes
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onPickChange}
                style={{ display: "none" }}
              />
            </div>
            {parseError && <div className="bulk-error-banner">{parseError}</div>}
          </>
        )}

        {phase === "idle" && scrapePanel}

        {(phase === "preview" || phase === "importing" || phase === "done") && (
          <>
            <div className="bulk-file-info">
              <div>
                <strong>{file?.name}</strong> · {rows.length} cançons
              </div>
              {phase === "preview" && (
                <div className="bulk-actions">
                  <button className="btn-ghost" onClick={resetAll}>
                    Cancel·lar
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={findMissingLinks}
                    disabled={findingLinks}
                    title="Cerca a YouTube i Spotify els links que falten (només omple buits)"
                  >
                    {findingLinks
                      ? `Buscant… ${findProgress.done}/${findProgress.total}`
                      : "🔎 Buscar links que falten"}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={startImport}
                    disabled={findingLinks}
                  >
                    Importar
                  </button>
                </div>
              )}
              {phase === "importing" && (
                <div className="bulk-progress-summary">
                  {totals.ok + totals.dup + totals.err} / {totals.total} ·
                  {" "}✅ {totals.ok} · ⚠️ {totals.dup} · ❌ {totals.err}
                </div>
              )}
              {phase === "done" && (
                <div className="bulk-actions">
                  <div className="bulk-progress-summary">
                    Acabat: ✅ {totals.ok} · ⚠️ {totals.dup} duplicades · ❌ {totals.err} errors
                  </div>
                  <button className="btn-primary" onClick={resetAll}>
                    Nova importació
                  </button>
                </div>
              )}
            </div>

            <div className="bulk-required-bar">
              <div className="bulk-required-title">
                Camps obligatoris (les files que no compleixin se saltaran):
              </div>
              <div className="bulk-required-checks">
                <label className="bulk-required-check is-locked">
                  <input type="checkbox" checked disabled />
                  <span>Link web</span>
                </label>
                <label className="bulk-required-check is-locked">
                  <input type="checkbox" checked disabled />
                  <span>Títol</span>
                </label>
                <label className="bulk-required-check is-locked">
                  <input type="checkbox" checked disabled />
                  <span>Artista</span>
                </label>
                {OPTIONAL_FIELDS.map((f) => (
                  <label key={f.key} className="bulk-required-check">
                    <input
                      type="checkbox"
                      checked={requiredFields.has(f.key)}
                      disabled={phase !== "preview"}
                      onChange={() => toggleRequired(f.key)}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="bulk-list-toggle"
              onClick={() => setListCollapsed((v) => !v)}
              aria-expanded={!listCollapsed}
              aria-controls="bulk-rows-list"
            >
              <span className={`bulk-list-toggle-arrow ${listCollapsed ? "is-collapsed" : ""}`}>
                ▼
              </span>
              {listCollapsed ? "Mostrar" : "Amagar"} llista ({rows.length})
            </button>

            <ol
              id="bulk-rows-list"
              className="bulk-rows-list"
              hidden={listCollapsed}
            >
              {rows.map((r, i) => {
                const isOverridden = overrideIndexes.has(i)
                return (
                  <li key={i} className={`bulk-row bulk-row-${r.status}`}>
                    <div className="bulk-row-icon">{iconFor(r.status)}</div>
                    <div className="bulk-row-info">
                      <div className="bulk-row-title">
                        <strong>{r.title}</strong> — {r.artist}
                        {isOverridden && (
                          <span className="bulk-row-override-tag">
                            sense validar
                          </span>
                        )}
                      </div>
                      <div className="bulk-row-meta">
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          {r.url}
                        </a>
                        {!isSupportedUrl(r.url) && (
                          <span className="bulk-row-warn"> (host no suportat)</span>
                        )}
                        {r.youtubeUrl && (
                          <>
                            {" · "}
                            <a
                              href={r.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="YouTube"
                            >
                              YT
                            </a>
                          </>
                        )}
                        {r.spotifyUrl && (
                          <>
                            {" · "}
                            <a
                              href={r.spotifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Spotify"
                            >
                              SP
                            </a>
                          </>
                        )}
                      </div>
                      {r.error && (
                        <div className="bulk-row-error-msg">{r.error}</div>
                      )}
                    </div>
                    {r.status === "error" && phase !== "importing" && (
                      <button
                        className="btn-xs"
                        onClick={() => importRowAnyway(i)}
                        title="Marca aquesta fila per importar saltant la validació de camps requerits al següent 'Importar'"
                      >
                        Importar igualment
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>

            {phase === "preview" && scrapePanel}
          </>
        )}
      </div>
    </>
  )
}

function iconFor(s: RowStatus): string {
  switch (s) {
    case "pending":
      return "⏳"
    case "running":
      return "⏵"
    case "ok":
      return "✅"
    case "duplicate":
      return "⚠️"
    case "error":
      return "❌"
  }
}

/**
 * Parser CSV mínim però robust per al nostre format. Suporta:
 *  - Camps entre cometes dobles `"..."` (per a tags amb comes dins).
 *  - Escapament de cometes amb `""` dins d'un camp citat.
 *  - Línies en blanc (es salten).
 *  - Línies que comencen per `#` (comentari, es salten).
 *
 * No suporta cap línia de capçalera: cada fila ha de ser una cançó.
 */
function parseCsv(text: string): ParsedRow[] {
  const lines = splitCsvLines(text.replace(/\r\n?/g, "\n"))
  const rows: ParsedRow[] = []
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim()) continue
    if (line.trim().startsWith("#")) continue

    const fields = parseCsvLine(line)
    // Esperem 9 camps; rellenem amb buit els que faltin pel final
    while (fields.length < 9) fields.push("")
    const [url, title, artist, album, year, youtubeUrl, spotifyUrl, language, tags] = fields

    if (!url.trim() || !title.trim() || !artist.trim()) {
      throw new Error(
        `Fila ${li + 1}: link, títol i artista són obligatoris.`,
      )
    }

    rows.push({
      url: url.trim(),
      title: title.trim(),
      artist: artist.trim(),
      album: emptyToNull(album),
      year: emptyToNull(year),
      youtubeUrl: emptyToNull(youtubeUrl),
      spotifyUrl: emptyToNull(spotifyUrl),
      language: emptyToNull(language),
      tags: emptyToNull(tags),
    })
  }
  return rows
}

/** Talla el CSV en línies respectant els salts de línia dins de cometes. */
function splitCsvLines(text: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      // cometa: alterna estat (excepte si és doble escape)
      if (inQuotes && text[i + 1] === '"') {
        cur += '""'
        i++
        continue
      }
      inQuotes = !inQuotes
      cur += c
      continue
    }
    if (c === "\n" && !inQuotes) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/** Parseja una línia CSV individual respectant cometes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (c === "," && !inQuotes) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function emptyToNull(v: string | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/**
 * Construeix les files CSV (sense capçalera) a partir del resultat del scrape.
 * Columnes: link, títol, artista, àlbum, any, youtube, spotify, idioma, tags.
 * Idioma="ca" per defecte (acordscatala = català). YouTube/Spotify/tags buits.
 */
function buildCsvFromScrape(r: ScrapeResponse): string {
  const lines: string[] = []
  for (const s of r.songs) {
    const fields = [
      s.url,
      s.title,
      r.artist,
      s.album ?? "",
      s.year != null ? String(s.year) : "",
      "", // youtube
      "", // spotify
      "ca",
      "", // tags
    ]
    lines.push(fields.map(csvEscape).join(","))
  }
  return lines.join("\n")
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "artista"
}
