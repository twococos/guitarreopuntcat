/** "m:ss" a partir de mil·lisegons (durades de Spotify). */
export function formatMs(ms: number): string {
  return formatSecondsClock(Math.round(ms / 1000))
}

/** "m:ss" a partir de segons. */
export function formatSecondsClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
