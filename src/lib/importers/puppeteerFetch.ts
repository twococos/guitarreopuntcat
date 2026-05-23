/**
 * Fetch via Puppeteer per a webs protegides amb Cloudflare/Akamai que
 * requereixen un navegador real (com www.ultimate-guitar.com).
 *
 * Llança un Chromium headless per cada petició — més car que `defaultFetch`,
 * però l'única manera de saltar el challenge. Reutilitzem la mateixa
 * dependència que el generador de PDFs.
 */

import "server-only"
import puppeteer from "puppeteer"

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

interface PuppeteerFetchOptions {
  /** CSS selector(s) que indiquen que la pàgina ja té el contingut. */
  waitForSelector?: string
  /** Mil·lisegons d'espera addicional després del selector / load. */
  settleMs?: number
  /** Timeout total (ms). Per defecte 60s. */
  timeoutMs?: number
}

export async function puppeteerFetch(
  url: string,
  options: PuppeteerFetchOptions = {},
): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--lang=en-US,en;q=0.9",
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent(DEFAULT_UA)
    await page.setViewport({ width: 1280, height: 800 })
    // Anti-detecció bàsica: amaga `navigator.webdriver` i fixa idiomes.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined })
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] })
    })

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: options.timeoutMs ?? 60_000,
    })

    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeoutMs ?? 60_000,
        })
      } catch {
        // Continuem encara que no es trobi: el parser ja fallarà amb un
        // missatge clar si l'HTML no té contingut.
      }
    }

    if (options.settleMs && options.settleMs > 0) {
      await new Promise((r) => setTimeout(r, options.settleMs))
    }

    return await page.content()
  } finally {
    await browser.close()
  }
}
