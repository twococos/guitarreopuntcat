import { notFound } from "next/navigation"
import { getCanconerByToken } from "@/db/queries/canconers"
import { transposeKey, transposeContent } from "@/lib/transpose"
import { SharedIndex } from "@/components/shared/SharedIndex"
import { SharedPdfButton } from "@/components/shared/SharedPdfButton"

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharedPage({ params }: Props) {
  const { token } = await params
  const canconer = await getCanconerByToken(token)
  if (!canconer) notFound()

  const songIds = canconer.songs.map((s) => `song-${s.id}`)
  const songTitles = canconer.songs.map((s) => s.title)

  return (
    <>
      <header>
        <a href="/" className="back-link">
          ← Cançoner
        </a>
        <h1 id="shared-title">{canconer.title}</h1>
        <p className="subtitle" id="shared-meta">
          Per {canconer.owner_name} · {canconer.songs.length} cançons
        </p>
        <SharedPdfButton
          title={canconer.title}
          songs={canconer.songs.map((s) => ({ id: s.id, semitones: s.semitones }))}
        />
      </header>
      <div id="shared-layout">
        <nav id="shared-nav">
          <h2>Índex</h2>
          <SharedIndex ids={songIds} titles={songTitles} />
        </nav>
        <main id="shared-songs">
          {canconer.songs.map((s) => {
            const displayKey = transposeKey(s.key, s.semitones)
            const content = transposeContent(s.content, s.semitones)
            return (
              <article key={s.id} className="song-card" id={`song-${s.id}`}>
                <div className="song-card-header">
                  <div>
                    <h2>{s.title}</h2>
                    <p className="song-card-meta">
                      {s.artist}
                      {s.capo ? ` · Cejilla ${s.capo}` : ""}
                    </p>
                  </div>
                  <span className="song-card-key">{displayKey}</span>
                </div>
                {/* eslint-disable-next-line react/no-danger */}
                <div
                  className="song-card-body"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              </article>
            )
          })}
        </main>
      </div>
    </>
  )
}
