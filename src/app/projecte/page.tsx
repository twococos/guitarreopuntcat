import type { Metadata } from "next"
import { PublicNav } from "@/components/public/PublicNav"
import { getT } from "@/lib/i18n"

const t = getT()

export const metadata: Metadata = {
  title: t.metadata.projecte.title,
  description: t.metadata.projecte.description,
}

export default function ProjectePage() {
  const t = getT()
  return (
    <>
      <PublicNav />

      <header className="public-static-banner">
        <div className="public-static-banner-inner">
          <h1 className="public-static-title">
            {t.public.projecte.titol}
            <span className="public-static-lede">
              {t.public.projecte.lede}
            </span>
          </h1>
        </div>
      </header>

      <main className="public-static">

        <section className="public-static-section">
          <h2>{t.public.projecte.queEs}</h2>
          <p>
            <em>(Placeholder)</em> {t.public.projecte.queEsText}
          </p>
        </section>

        <section className="public-static-section">
          <h2>{t.public.projecte.donVe}</h2>
          <p>
            <em>(Placeholder)</em> {t.public.projecte.donVeText}
          </p>
        </section>

        <section className="public-static-section">
          <h2>{t.public.projecte.perQue}</h2>
          <p>
            <em>(Placeholder)</em> {t.public.projecte.perQueText}
          </p>
        </section>
      </main>
    </>
  )
}
