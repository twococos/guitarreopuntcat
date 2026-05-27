import { notFound } from "next/navigation"
import { getCanconerByToken } from "@/db/queries/canconers"
import CanconerPreviewLayout from "@/components/shared/CanconerPreviewLayout"

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharedPage({ params }: Props) {
  const { token } = await params
  const canconer = await getCanconerByToken(token)
  if (!canconer) notFound()

  return (
    <CanconerPreviewLayout
      canconer={canconer}
      ownerName={canconer.owner_name}
    />
  )
}
