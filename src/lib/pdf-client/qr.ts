import QRCode from "qrcode"

/**
 * Genera un QR com a string SVG inline per a inserir al PDF.
 * Mida 50×50 px, sense marges.
 */
export async function buildQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 0,
    width: 60,
    errorCorrectionLevel: "M",
  })
}
