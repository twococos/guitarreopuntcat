import type { MetadataRoute } from "next"
import { getBaseUrl } from "@/lib/site"

/**
 * robots.txt
 *
 * Permet crawl de l'àrea pública (/, /songs/*, /projecte, /contacte) i
 * bloqueja l'app privada (/app/*), els endpoints d'API i les vistes
 * efímeres de compartir (/c/[token]).
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/c/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
