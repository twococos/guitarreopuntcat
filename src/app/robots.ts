import type { MetadataRoute } from "next"
import { getBaseUrl } from "@/lib/site"

/**
 * robots.txt
 *
 * Permet crawl de l'àrea pública (/, /songs/*, /songbooks/*, /projecte,
 * /contacte) i bloqueja l'app privada (/app/*), els endpoints d'API, les
 * vistes efímeres de compartir (/c/[token]) i les cançons privades.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/c/", "/songs/private/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
