"use client"
import { useEffect, useRef, useState } from "react"
import { getT } from "@/lib/i18n"
import { useToastStore } from "@/hooks/useToasts"
import { IconSearch } from "@/components/shared/Icons"
import { looksLikeSpotifyLink, type SpotifyKind, type SpotifyTrack } from "@/lib/spotify/url"
import type { ImportSource } from "./types"
import { formatMs } from "./format"

interface Props {
  /** Cançons que ja són a la llista de revisió (es marquen com a afegides). */
  addedKeys: string[]
  onAdd: (tracks: SpotifyTrack[], source: ImportSource) => void
}

interface Resolved {
  kind: SpotifyKind
  name: string
  tracks: SpotifyTrack[]
  truncated: boolean
}

const SEARCH_DEBOUNCE_MS = 300

/**
 * Barra de la pestanya «Importar cançons». Un enllaç de Spotify es resol en
 * enganxar-lo (o amb Enter / «Carrega») i les seves cançons van a la llista de
 * revisió; un text cerca cançons a Spotify i en pots afegir les que vulguis.
 */
export function SpotifyImportBar({ addedKeys, onAdd }: Props) {
  const t = getT()
  const ti = t.admin.importTab
  const toast = useToastStore.getState().show
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SpotifyTrack[] | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const added = new Set(addedKeys)
  const isLink = looksLikeSpotifyLink(value)

  // Cerca amb debounce mentre s'escriu (si no és un enllaç)
  useEffect(() => {
    const q = value.trim()
    if (isLink || q.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/import/spotify-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { configured: boolean; tracks: SpotifyTrack[] }
        setNotConfigured(!data.configured)
        setResults(data.tracks)
        setOpen(true)
      } catch {
        if (!controller.signal.aborted) {
          setResults(null)
          toast(ti.errorCerca, { type: "error" })
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value, isLink, toast, ti.errorCerca])

  // Clic fora o Esc tanquen el desplegable
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function resolve(input: string) {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/admin/import/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as Resolved
      onAdd(data.tracks, { kind: data.kind, name: data.name, count: data.tracks.length, truncated: data.truncated })
      setValue("")
    } catch {
      toast(ti.errorEnllac, { type: "error" })
    } finally {
      setLoading(false)
    }
  }

  function addResult(track: SpotifyTrack) {
    if (added.has(track.spotify_id)) return
    onAdd([track], { kind: "search", name: ti.origen.search, count: 1, truncated: false })
  }

  return (
    <div className="import-bar" ref={boxRef}>
      <div className="import-bar-input">
        <IconSearch />
        <input
          type="text"
          value={value}
          placeholder={ti.placeholder}
          disabled={loading}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => results && setOpen(true)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (looksLikeSpotifyLink(text)) {
              e.preventDefault()
              setValue(text.trim())
              resolve(text.trim())
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isLink) resolve(value.trim())
          }}
        />
        {isLink && (
          <button className="btn-xs success" onClick={() => resolve(value.trim())} disabled={loading}>
            {loading ? ti.carregant : ti.carregar}
          </button>
        )}
        {searching && <span className="import-bar-status">{ti.cercant}</span>}
      </div>
      {notConfigured && <p className="transcriptions-error">{ti.noConfigurat}</p>}
      {open && results && !isLink && (
        <ul className="import-results" role="listbox">
          {results.length === 0 && <li className="import-results-empty">{ti.capResultat}</li>}
          {results.map((r) => {
            const isAdded = added.has(r.spotify_id)
            return (
              <li key={r.spotify_id}>
                <button
                  type="button"
                  className={`import-result ${isAdded ? "is-added" : ""}`}
                  onClick={() => addResult(r)}
                  disabled={isAdded}
                >
                  {r.image_url ? <img src={r.image_url} alt="" /> : <span className="import-cover-empty" />}
                  <span className="import-result-text">
                    <strong>{r.title}</strong>
                    <span>
                      {r.artists.join(", ")}
                      {r.album && ` · ${r.album}`}
                      {r.year && ` · ${r.year}`}
                    </span>
                  </span>
                  <span className="import-result-side">{isAdded ? ti.afegida : formatMs(r.duration_ms)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
