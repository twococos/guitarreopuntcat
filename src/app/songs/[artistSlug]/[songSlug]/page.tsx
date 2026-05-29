import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getSongBySlug } from "@/db/queries/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { PublicSongView } from "@/components/songs/PublicSongView"

interface Props {
  params: Promise<{ artistSlug: string; songSlug: string }>
}

// Genera <title> i <meta description> SEO-friendly. Aquesta és l'entrada
// principal d'usuaris des de Google, així que paga la pena posar-hi cura.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artistSlug, songSlug } = await params
  const song = await getSongBySlug(artistSlug, songSlug)
  if (!song) return { title: "Cançó no trobada — guitarreo.cat" }

  const description = extractLyricSnippet(song.content)
  return {
    title: `${song.title} — ${song.artist} | Acords i lletra | guitarreo.cat`,
    description: description
      ? `${description.slice(0, 150)}…`
      : `Acords i lletra de "${song.title}" de ${song.artist}. Transposició i autoscroll inclosos.`,
    openGraph: {
      title: `${song.title} — ${song.artist}`,
      description: `Acords i lletra a guitarreo.cat`,
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
