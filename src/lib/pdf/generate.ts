import "server-only"
import puppeteer from "puppeteer"

/**
 * Llança Puppeteer amb un HTML donat i retorna el PDF resultant
 * com a Buffer (A4 amb marges).
 *
 * No reutilitza navegadors — cada crida llança i tanca un Chromium.
 * Per a un VPS amb càrrega baixa això és acceptable; si la càrrega
 * creix, val la pena un pool.
 */
export async function generatePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
