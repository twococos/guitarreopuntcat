import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getPublicSongbook } from "@/db/queries/canconers"
import { getSessionUser } from "@/lib/session"
import { PublicNav } from "@/components/public/PublicNav"
import { SongbookViewer } from "@/components/songbooks/SongbookViewer"
import { initialIndexFrom, sampleTitles, toViewerData } from "@/components/songbooks/toViewerData"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ id: string; slug: string }>
  searchParams: Promise<{ song?: string | string[] }>
}

export const dynamic = "force-dynamic"

async function load(rawId: string) {
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) return null
  return getPublicSongbook(id, await getSessionUser())
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getT()
  const { id } = await params
  const c = await load(id)
  if (!c) return { title: t.metadata.songbook.noTrobat }
  return {
    title: t.metadata.songbook.title(c.title, c.owner_name),
    description: t.metadata.songbook.description(c.title, c.songs.length, sampleTitles(c)),
    alternates: { canonical: `/songbooks/${c.id}/${c.slug}` },
  }
}

/**
 * /songbooks/[id]/[slug] — cançoner públic. El slug és decoratiu: si no
 * coincideix (s'ha canviat el títol), redirigeix a la URL canònica.
 */
export default async function PublicSongbookPage({ params, searchParams }: Props) {
  const { id, slug } = await params
  const c = await load(id)
  if (!c) notFound()
  if (c.slug && slug !== c.slug) redirect(`/songbooks/${c.id}/${c.slug}`)

  return (
    <>
      <PublicNav />
      <SongbookViewer
        songbook={toViewerData(c)}
        pdfContext={{ songbook_id: c.id }}
        initialIndex={initialIndexFrom((await searchParams).song)}
      />
    </>
  )
}
