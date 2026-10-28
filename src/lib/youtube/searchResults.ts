/**
 * Resultats d'una cerca de YouTube a partir de l'HTML de
 * `youtube.com/results?search_query=…` (sense clau d'API). Pur.
 *
 * La pàgina porta `var ytInitialData = {…};` amb els resultats en ordre de
 * presentació; cada vídeo és un `videoRenderer` (`videoId`, `title.runs`,
 * `lengthText.simpleText` "m:ss", `ownerText.runs`, `ownerBadges`,
 * `viewCountText.simpleText`). Shorts, llistes i canals no en són.
 */

export interface YtCandidate {
  video_id: string
  title: string
  channel: string
  /** Null en directes o si YouTube no dona la durada. */
  duration_s: number | null
  views: number | null
  /** Insígnia d'artista oficial (la nota musical al costat del canal). */
  official: boolean
  /** Canal «Artista - Topic»: àudio d'estudi que YouTube genera a partir de la discogràfica. */
  topic: boolean
}

interface Runs {
  runs?: Array<{ text?: string }>
  simpleText?: string
}

interface VideoRenderer {
  videoId?: string
  title?: Runs
  lengthText?: Runs
  ownerText?: Runs
  longBylineText?: Runs
  viewCountText?: Runs
  ownerBadges?: Array<{ metadataBadgeRenderer?: { style?: string } }>
}

function runsText(r: Runs | undefined): string {
  if (!r) return ""
  if (typeof r.simpleText === "string") return r.simpleText
  return (r.runs ?? []).map((x) => x.text ?? "").join("")
}

/** "4:35" o "1:02:03" → segons. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":")
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return null
  return parts.reduce((acc, p) => acc * 60 + parseInt(p, 10), 0)
}

function parseViews(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "")
  return digits ? parseInt(digits, 10) : null
}

function extractInitialData(html: string): unknown {
  const m = /var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

export function parseSearchResults(html: string): YtCandidate[] {
  const data = extractInitialData(html)
  if (!data) return []
  const renderers: VideoRenderer[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      for (const n of node) walk(n)
      return
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "videoRenderer") renderers.push(v as VideoRenderer)
      else walk(v)
    }
  }
  walk(data)

  const seen = new Set<string>()
  const out: YtCandidate[] = []
  for (const v of renderers) {
    if (!v.videoId || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || seen.has(v.videoId)) continue
    seen.add(v.videoId)
    const channel = runsText(v.ownerText) || runsText(v.longBylineText)
    const length = runsText(v.lengthText)
    out.push({
      video_id: v.videoId,
      title: runsText(v.title),
      channel,
      duration_s: length ? parseClock(length) : null,
      views: v.viewCountText ? parseViews(runsText(v.viewCountText)) : null,
      official: (v.ownerBadges ?? []).some((b) => b.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_VERIFIED_ARTIST"),
      topic: / - Topic$/.test(channel),
    })
  }
  return out
}
