import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getSongBySlug } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { PublicSongView } from "@/components/songs/PublicSongView"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ artistSlug: string; songSlug: string }>
}

// Genera <title> i <meta description> SEO-friendly. Aquesta és l'entrada
// principal d'usuaris des de Google, així que paga la pena posar-hi cura.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getT()
  const { artistSlug, songSlug } = await params
  const song = await getSongBySlug(artistSlug, songSlug)
  if (!song) return { title: t.metadata.song.noTrobada }

  const description = extractLyricSnippet(song.content)
  return {
    title: t.metadata.song.title(song.title, song.artist),
    description: description
      ? `${description.slice(0, 150)}…`
      : t.metadata.song.descriptionFallback(song.title, song.artist),
    openGraph: {
      title: t.metadata.song.ogTitle(song.title, song.artist),
      description: t.metadata.song.ogDescription,
      type: "music.song",
    },
  }
}

/**
 * /songs/[artistSlug]/[songSlug] — pàgina pública d'una cançó.
 * Server Component que carrega la cançó i delega a `<PublicSongView>`
 * els controls interactius (transposició, autoscroll, mida).
 */
export default async function PublicSongPage({ params }: Props) {
  const { artistSlug, songSlug } = await params
  const song = await getSongBySlug(artistSlug, songSlug)
  if (!song) notFound()

  return (
    <>
      <PublicNav />
      <PublicSongView song={song} />
    </>
  )
}

/**
 * Treu un fragment de lletra net (sense tags `<ch>`/`<sec>`) per fer-lo
 * servir com a `meta description`. Si no troba res llegible, retorna null.
 */
function extractLyricSnippet(content: string): string | null {
  const noTags = content
    .replace(/<ch>[^<]*<\/ch>/g, "")
    .replace(/<sec>[^<]*<\/sec>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return noTags || null
}
