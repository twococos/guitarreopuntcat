import type { Metadata } from "next"
import { PublicNav } from "@/components/public/PublicNav"
import { getT } from "@/lib/i18n"

const t = getT()

export const metadata: Metadata = {
  title: t.metadata.contacte.title,
  description: t.metadata.contacte.description,
}

export default function ContactePage() {
  const t = getT()
  return (
    <>
      <PublicNav />

      <header className="public-static-banner">
        <div className="public-static-banner-inner">
          <h1 className="public-static-title">
            {t.public.contacte.titol}
            <span className="public-static-lede">
              {t.public.contacte.lede}
            </span>
          </h1>
        </div>
      </header>

      <main className="public-static">

        <section className="public-static-section">
          <h2>{t.public.contacte.emailTitol}</h2>
          <p>
            <em>(Placeholder)</em>{" "}
            <a href={`mailto:${t.public.contacte.emailAdresa}`}>{t.public.contacte.emailAdresa}</a>
          </p>
        </section>

        <section className="public-static-section">
          <h2>{t.public.contacte.quiSomTitol}</h2>
          <ul className="public-static-list">
            <li>
              <em>(Placeholder)</em> Nom Llinatges — desenvolupament i disseny.
            </li>
            <li>
              <em>(Placeholder)</em> Nom Llinatges — curador del catàleg.
            </li>
          </ul>
        </section>

        <section className="public-static-section">
          <h2>{t.public.contacte.formulariTitol}</h2>
          <p>
            {t.public.contacte.formulariPropertyament}
          </p>
        </section>
      </main>
    </>
  )
}
