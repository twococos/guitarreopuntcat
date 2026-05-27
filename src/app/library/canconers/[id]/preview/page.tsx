import { notFound, redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { getCanconerById, getCanconerByIdForAdmin } from "@/db/queries/canconers"
import CanconerPreviewLayout from "@/components/shared/CanconerPreviewLayout"

interface Props {
  params: Promise<{ id: string }>
}

export default async function PrivatePreviewPage({ params }: Props) {
  // Autenticació: cal estar identificat
  const user = await getSessionUser()
  if (!user) redirect("/")

  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  if (user.role === "admin") {
    // Els admins poden veure qualsevol cançoner (útil per a suport i revisió)
    const canconer = await getCanconerByIdForAdmin(id)
    if (!canconer) notFound()

    return (
      <CanconerPreviewLayout
        canconer={canconer}
        ownerName={canconer.owner_name}
        backHref="/library?tab=canconers"
        backLabel="← La teva Biblioteca"
      />
    )
  }

  // Usuari normal: ownership check implícit al WHERE de la query
  const canconer = await getCanconerById(id, user.id)
  if (!canconer) notFound()

  return (
    <CanconerPreviewLayout
      canconer={canconer}
      ownerName={canconer.owner_name}
      backHref="/library?tab=canconers"
      backLabel="← La teva Biblioteca"
    />
  )
}
