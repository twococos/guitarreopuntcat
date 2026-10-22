/**
 * src/lib/player/audioUnlock.ts — AudioContext creat dins el gest de l'usuari.
 *
 * Safari (i Chrome sense interacció) no deixa sonar un AudioContext creat fora d'un clic. El
 * controlador es carrega amb import() dinàmic, que ja és asíncron: per això el context es crea
 * aquí, sincrònicament al clic de «Toca-la», i se li passa després. Mòdul lleuger, sense dependències.
 */

let iosUnlocked = false

export function createUnlockedAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx({ latencyHint: "interactive" })
  void ctx.resume()
  unlockIosAudio()
  return ctx
}

/**
 * iOS: amb el commutador de silenci, WebAudio no sona si la pàgina no reprodueix res
 * "multimèdia". Un <audio> silenciós en bucle passa la sessió d'àudio a reproducció.
 */
function unlockIosAudio() {
  if (iosUnlocked) return
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  if (!ios) return
  iosUnlocked = true
  const audio = document.createElement("audio")
  audio.setAttribute("x-webkit-airplay", "deny")
  audio.preload = "auto"
  audio.loop = true
  // 0,5 ms de silenci (WAV mono de 8 kHz)
  audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA"
  void audio.play().catch(() => undefined)
}
