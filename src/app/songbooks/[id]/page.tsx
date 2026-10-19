import { notFound, redirect } from "next/navigation"
import { getPublicSongbook } from "@/db/queries/canconers"
import { getSessionUser } from "@/lib/session"

interface Props {
  params: Promise<{ id: string }>
}

/** /songbooks/[id] → /songbooks/[id]/[slug]. */
export default async function SongbookIdRedirect({ params }: Props) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const c = await getPublicSongbook(id, await getSessionUser())
  if (!c) notFound()
  redirect(`/songbooks/${c.id}/${c.slug ?? ""}`)
}
