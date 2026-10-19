import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { getCanconerById, getCanconerByIdForAdmin } from "@/db/queries/canconers"
import { PublicNav } from "@/components/public/PublicNav"
import { SongbookViewer } from "@/components/songbooks/SongbookViewer"
import { initialIndexFrom, toViewerData } from "@/components/songbooks/toViewerData"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ song?: string | string[]; from?: string }>
}

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Previsualització d'un cançoner propi (o de qualsevol, per als admins), amb el
 * mateix visor que veurà el públic. Les privades es marquen a l'índex.
 */
export default async function PrivatePreviewPage({ params, searchParams }: Props) {
  // Autenticació: cal estar identificat
  const user = await getSessionUser()
  if (!user) redirect("/")

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  // Admins: qualsevol cançoner (suport i revisió). Usuari: ownership al WHERE.
  const canconer = user.role === "admin" ? await getCanconerByIdForAdmin(id) : await getCanconerById(id, user.id)
  if (!canconer) notFound()

  const t = getT()
  const { song, from } = await searchParams
  const backLink =
    from === "admin" && user.role === "admin"
      ? { href: "/app/admin?tab=canconers", label: t.app.library.backToAdmin }
      : { href: "/app/library?tab=canconers", label: t.app.library.backToLibrary }
  return (
    <>
      <PublicNav />
      <SongbookViewer
        songbook={toViewerData(canconer)}
        pdfContext={{ songbook_id: canconer.id }}
        initialIndex={initialIndexFrom(song)}
        ownerPreview={canconer.user_id === user.id}
        backLink={backLink}
      />
    </>
  )
}
