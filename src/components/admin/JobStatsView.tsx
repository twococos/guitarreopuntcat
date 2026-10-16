"use client"
import { getT } from "@/lib/i18n"

/**
 * Estadístiques d'una feina de transcripció (JSON obert que envia el worker).
 * Els camps coneguts surten amb etiqueta i format; qualsevol camp nou es mostra
 * amb el seu camí, de manera que el worker hi pot afegir dades sense tocar res aquí.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

/** Camps en format de durada (segons), a més de tots els `timing.*`. */
const DURATION_PATHS = new Set(["audio.duration_s"])
/** Camps entre 0 i 1 que es mostren en %. */
const PERCENT_PATHS = new Set([
  "lyrics.matched_ratio",
  "lyrics.timed_ratio",
  "lyrics.asr_mean_conf",
  "chords.mean_conf",
  "key.confidence",
])

export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m}:${String(s % 60).padStart(2, "0")}`
}

/** Aplana l'objecte a parells (camí amb punts, valor). Les llistes de valors simples queden senceres. */
function flatten(obj: { [k: string]: Json }, prefix = ""): [string, Json][] {
  const out: [string, Json][] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === "object" && !Array.isArray(v)) out.push(...flatten(v, path))
    else out.push([path, v])
  }
  return out
}

function formatValue(path: string, value: Json): string {
  const tt = getT().admin.transcriptionsTab
  if (value === null) return "—"
  if (typeof value === "number") {
    if (PERCENT_PATHS.has(path)) return `${Math.round(value * 100)} %`
    if (DURATION_PATHS.has(path) || path.startsWith("timing.")) return formatSeconds(value)
    return String(value)
  }
  if (typeof value === "boolean") return value ? "sí" : "no"
  if (Array.isArray(value)) {
    if (value.length === 0) return "—"
    return value.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
  }
  if (typeof value === "object") return JSON.stringify(value)
  if (path === "lyrics.source") return tt.fontsLletra[value] ?? value
  if (path === "device.type") return value.toUpperCase()
  return value
}

export function JobStatsView({ stats }: { stats: Record<string, unknown> | null }) {
  const tt = getT().admin.transcriptionsTab
  if (!stats) return <p className="transcriptions-hint">{tt.senseEstadistiques}</p>

  const groups = new Map<string, [string, Json][]>()
  for (const [path, value] of flatten(stats as { [k: string]: Json })) {
    if (path === "warnings" && Array.isArray(value) && value.length === 0) continue
    const top = path.includes(".") ? path.split(".")[0] : Array.isArray(value) ? path : "general"
    if (!groups.has(top)) groups.set(top, [])
    groups.get(top)!.push([path, value])
  }

  return (
    <div className="job-stats">
      {[...groups.entries()].map(([group, fields]) => (
        <div key={group} className="job-stats-group">
          <h4>{tt.statsGrups[group] ?? group}</h4>
          {group === "warnings" ? (
            <ul>
              {(stats.warnings as string[]).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <dl>
              {fields.map(([path, value]) => (
                <div key={path}>
                  <dt>{tt.statsCamps[path] ?? (group === "models" ? path.slice(7) : path)}</dt>
                  <dd>{formatValue(path, value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </div>
  )
}
