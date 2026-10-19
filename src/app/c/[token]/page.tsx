import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCanconerByToken } from "@/db/queries/canconers"
import { PublicNav } from "@/components/public/PublicNav"
import { SongbookViewer } from "@/components/songbooks/SongbookViewer"
import { initialIndexFrom, toViewerData } from "@/components/songbooks/toViewerData"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ token: string }>
  searchParams: Promise<{ song?: string | string[] }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getT()
  const c = await getCanconerByToken((await params).token)
  return {
    title: c ? t.metadata.songbook.title(c.title, c.owner_name) : t.metadata.songbook.noTrobat,
    // Enllaç per compartir: mai a Google (encara que el cançoner sigui públic)
    robots: { index: false, follow: false },
  }
}

/** /c/[token] — cançoner compartit per enllaç. Mateix visor que els públics. */
export default async function SharedPage({ params, searchParams }: Props) {
  const { token } = await params
  const canconer = await getCanconerByToken(token)
  if (!canconer) notFound()

  return (
    <>
      <PublicNav />
      <SongbookViewer
        songbook={toViewerData(canconer)}
        pdfContext={{ share_token: token }}
        initialIndex={initialIndexFrom((await searchParams).song)}
      />
    </>
  )
}
