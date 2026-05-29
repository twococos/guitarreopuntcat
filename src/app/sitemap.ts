import type { MetadataRoute } from "next"
import {
  listPublicSongsForSitemap,
  listPublicArtistsForSitemap,
} from "@/db/queries/songs"
import { getBaseUrl } from "@/lib/site"

export const dynamic = "force-dynamic"

/**
 * Sitemap dinàmic generat des de la BD. Inclou:
 *   · Estàtiques: portada, índex de cançons (les dues vistes), projecte, contacte.
 *   · Una entrada per cada artista públic (/songs/[artist]).
 *   · Una entrada per cada cançó pública (/songs/[artist]/[song]).
 *
 * Es **regenera a cada petició** (force-dynamic) perquè la BD pot créixer.
 * En producció amb molt trànsit es podria afegir cache curta.
 *
 * NO incloem `/app/*` (privat, és l'eina d'usuari) ni `/c/[token]`
 * (URLs efímeres per compartir).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/songs`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    {
      url: `${baseUrl}/songs?by=artist`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    { url: `${baseUrl}/projecte`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/contacte`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ]

  const [artists, songs] = await Promise.all([
    listPublicArtistsForSitemap(),
    listPublicSongsForSitemap(),
  ])

  const artistEntries: MetadataRoute.Sitemap = artists.map((a) => ({
    url: `${baseUrl}/songs/${encodeURIComponent(a.artistSlug)}`,
    lastModified: parseDate(a.updatedAt) ?? now,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  const songEntries: MetadataRoute.Sitemap = songs.map((s) => ({
    url: `${baseUrl}/songs/${encodeURIComponent(s.artistSlug)}/${encodeURIComponent(s.songSlug)}`,
    lastModified: parseDate(s.updatedAt) ?? now,
    changeFrequency: "weekly",
    priority: 0.8,
  }))

  return [...staticEntries, ...artistEntries, ...songEntries]
}

/** Converteix "YYYY-MM-DD HH:MM:SS" (format SQLite) a Date, o null si no es pot. */
function parseDate(raw: string | null): Date | null {
  if (!raw) return null
  const d = new Date(raw.replace(" ", "T") + "Z")
  return Number.isFinite(d.getTime()) ? d : null
}
