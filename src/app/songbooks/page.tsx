import type { Metadata } from "next"
import Link from "next/link"
import { listPublicSongbooks, type PublicSongbookSort } from "@/db/queries/canconers"
import { PublicNav } from "@/components/public/PublicNav"
import { MobileGateLink } from "@/components/public/MobileGateLink"
import { SongbookCard } from "@/components/public/SongbookCard"
import { getT } from "@/lib/i18n"

const t = getT()

export const metadata: Metadata = {
  title: t.metadata.songbooks.title,
  description: t.metadata.songbooks.description,
  alternates: { canonical: "/songbooks" },
}

export const dynamic = "force-dynamic"

const PER_PAGE = 24

interface Props {
  searchParams: Promise<{ sort?: string; page?: string }>
}

/**
 * /songbooks — tots els cançoners públics, per popularitat (visites) o
 * alfabètic, de 24 en 24. Mateixa capçalera i toggle que el catàleg /songs.
 */
export default async function SongbooksIndexPage({ searchParams }: Props) {
  const t = getT()
  const ts = t.public.songbooksIndex
  const params = await searchParams
  const sort: PublicSongbookSort = params.sort === "alpha" ? "alpha" : "popular"
  const requestedPage = Number(params.page)
  const { items, total, page, pages } = listPublicSongbooks({
    sort,
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    perPage: PER_PAGE,
  })

  const href = (p: number, s: PublicSongbookSort = sort) => {
    const q = new URLSearchParams()
    if (s === "alpha") q.set("sort", "alpha")
    if (p > 1) q.set("page", String(p))
    const qs = q.toString()
    return qs ? `/songbooks?${qs}` : "/songbooks"
  }

  return (
    <>
      <PublicNav />

      <header className="songs-index-banner">
        <div className="songs-index-banner-inner">
          <div className="songs-index-banner-text">
            <h1 className="songs-index-title">
              <span className="songs-index-title-main">{ts.titol}</span>
              <span className="songs-index-count">{total > 0 ? ts.count(total) : ts.encaNoNHiHa}</span>
            </h1>
          </div>
        </div>
      </header>

      <div className="songs-index">
        {total === 0 ? (
          <p className="songs-index-empty">
            {ts.buit} <MobileGateLink href="/app">{ts.creaElTeu}</MobileGateLink>.
          </p>
        ) : (
          <>
            <nav className="songbooks-index-bar" aria-label={ts.ordreAriaLabel}>
              <div className="songs-index-toggle" role="group">
                <Link
                  href={href(1, "popular")}
                  className={`songs-index-toggle-btn ${sort === "popular" ? "is-active" : ""}`}
                  prefetch={false}
                >
                  {ts.populars}
                </Link>
                <Link
                  href={href(1, "alpha")}
                  className={`songs-index-toggle-btn ${sort === "alpha" ? "is-active" : ""}`}
                  prefetch={false}
                >
                  {ts.alfabetic}
                </Link>
              </div>
            </nav>

            <ul className="public-home-grid">
              {items.map((s) => (
                <li key={s.id} className="public-home-card">
                  <SongbookCard songbook={s} />
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <nav className="songbooks-index-pager" aria-label={ts.paginacioAriaLabel}>
                {page > 1 ? (
                  <Link href={href(page - 1)} className="songbooks-index-page" prefetch={false}>
                    {ts.anterior}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="songbooks-index-pages">
                  {Array.from({ length: pages }, (_, i) => i + 1).map((p) =>
                    p === page ? (
                      <span key={p} className="songbooks-index-page is-active" aria-current="page">
                        {p}
                      </span>
                    ) : (
                      <Link key={p} href={href(p)} className="songbooks-index-page" prefetch={false}>
                        {p}
                      </Link>
                    ),
                  )}
                </span>
                {page < pages ? (
                  <Link href={href(page + 1)} className="songbooks-index-page" prefetch={false}>
                    {ts.seguent}
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  )
}
