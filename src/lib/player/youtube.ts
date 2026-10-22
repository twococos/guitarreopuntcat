/**
 * src/lib/player/youtube.ts — Càrrega de la IFrame API de YouTube i tipus mínims.
 *
 * L'script només es demana quan l'usuari prem play per primer cop (cap cookie ni pes a la
 * càrrega de la pàgina). El reproductor va pel domini youtube-nocookie.com.
 */

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getPlaybackRate(): number
  setPlaybackRate(rate: number): void
  getAvailablePlaybackRates(): number[]
  setVolume(volume: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  destroy(): void
}

export interface YTEvent<T = unknown> {
  target: YTPlayer
  data: T
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string
      videoId: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: YTEvent) => void
        onStateChange?: (e: YTEvent<number>) => void
        onError?: (e: YTEvent<number>) => void
        onPlaybackRateChange?: (e: YTEvent<number>) => void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Estats de `getPlayerState()`. */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

/** Errors que volen dir "aquest vídeo no es pot reproduir incrustat". */
export const YT_EMBED_ERRORS = new Set([100, 101, 150, 153])

let apiPromise: Promise<YTNamespace> | null = null

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error("No s'ha pogut carregar YouTube"))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

export interface CreatedPlayer {
  player: YTPlayer
  ready: Promise<void>
}

export async function createYouTubePlayer(
  el: HTMLElement,
  videoId: string,
  handlers: {
    onStateChange: (state: number) => void
    onError: (code: number) => void
    onRateChange: (rate: number) => void
  },
): Promise<YTPlayer> {
  const YT = await loadYouTubeApi()
  return new Promise<YTPlayer>((resolve) => {
    // L'API substitueix l'element per l'iframe: se li dona un fill propi
    const mount = document.createElement("div")
    el.replaceChildren(mount)
    const player = new YT.Player(mount, {
      host: "https://www.youtube-nocookie.com",
      videoId,
      width: "100%",
      height: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, iv_load_policy: 3, fs: 0 },
      events: {
        onReady: () => resolve(player),
        onStateChange: (e) => handlers.onStateChange(e.data),
        onError: (e) => handlers.onError(e.data),
        onPlaybackRateChange: (e) => handlers.onRateChange(e.data),
      },
    })
  })
}
