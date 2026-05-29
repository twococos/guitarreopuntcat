/**
 * URL canònica del lloc, sense barra final.
 *
 * Ordre de preferència:
 *   1. `NEXT_PUBLIC_SITE_URL` — si està definida explícitament.
 *   2. `AUTH_URL` — la URL que NextAuth ja necessita (reutilitzem per evitar duplicar config).
 *   3. `https://guitarreo.cat` — fallback hard-codat per a producció.
 *
 * Si afegeixes `NEXT_PUBLIC_SITE_URL` al `.env`, prevaldrà sobre la resta.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const authUrl = process.env.AUTH_URL
  if (authUrl) return authUrl.replace(/\/$/, "")
  return "https://guitarreo.cat"
}
