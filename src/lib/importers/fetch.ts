/**
 * Fetch HTTP per defecte per als importadors.
 *
 * - Posa un User-Agent realista (alguns servidors bloquegen UAs de Node).
 * - Timeout per evitar penjades.
 * - Límit de mida per evitar respostes excessives.
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function defaultFetch(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    // Headers complets de navegador: algunes webs (cifraclub via Akamai, p.ex.)
    // retornen 403 si només es passa el User-Agent.
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ca,es;q=0.9,en;q=0.8",
        "Sec-Ch-Ua": '"Chromium";v="120", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: controller.signal,
      redirect: "follow",
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const contentLength = res.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      throw new Error("Resposta massa gran")
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      throw new Error("Resposta massa gran")
    }

    return new TextDecoder("utf-8").decode(buf)
  } finally {
    clearTimeout(timer)
  }
}
