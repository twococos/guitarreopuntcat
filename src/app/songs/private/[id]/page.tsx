import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getSongById } from "@/db/queries/songs"
import { playerAvailability } from "@/db/queries/transcriptions"
import { getSessionUser } from "@/lib/session"
import { canEditSong, canViewSong } from "@/lib/access/songs"
import { PublicNav } from "@/components/public/PublicNav"
import { PublicSongView } from "@/components/songs/PublicSongView"
import { getT } from "@/lib/i18n"

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

async function load(params: Props["params"]) {
  const { id: raw } = await params
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  const viewer = await getSessionUser()
  const song = await getSongById(id)
  if (!song) return null
  const access = { id: song.id, state: song.state, ownerId: song.owner_id }
  // Pública: té la seva pàgina canònica; aquí només les que no ho són.
  if (!canViewSong(access, viewer)) return null
  return { song, viewer, canEdit: canEditSong(access, viewer) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getT()
  const data = await load(params)
  return {
    title: data ? t.metadata.song.privada(data.song.title, data.song.artist) : t.metadata.song.noTrobada,
    robots: { index: false, follow: false },
  }
}

/**
 * /songs/private/[id] — visor d'una cançó privada, arranjament o proposta.
 * Només la veu el propietari (i els admins); per a la resta, 404. Mateix visor
 * que les públiques. Les privades no tenen slug: el reben en publicar-se.
 */
export default async function PrivateSongPage({ params }: Props) {
  const data = await load(params)
  if (!data) notFound()
  const { song, canEdit } = data
  // Si ja és pública, cap a la seva URL canònica
  if (song.kind === "public" && song.artist_slug && song.song_slug) {
    redirect(`/songs/${song.artist_slug}/${song.song_slug}`)
  }

  let original: { title: string; href: string | null } | null = null
  if (song.original_song_id) {
    const o = await getSongById(song.original_song_id)
    if (o) {
      original = {
        title: o.title,
        href: o.state === 0 && o.artist_slug && o.song_slug ? `/songs/${o.artist_slug}/${o.song_slug}` : null,
      }
    }
  }

  return (
    <>
      <PublicNav />
      <PublicSongView
        song={song}
        player={playerAvailability(song.id)}
        privateInfo={
          song.kind === "public"
            ? undefined
            : { kind: song.kind, original, canEdit }
        }
      />
    </>
  )
}
