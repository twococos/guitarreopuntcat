import type { Metadata } from "next"
import { PublicNav } from "@/components/public/PublicNav"

export const metadata: Metadata = {
  title: "Contacte — guitarreo.cat",
  description:
    "Contacta amb l'equip de guitarreo.cat per proposar cançons, reportar errors o fer suggeriments.",
}

export default function ContactePage() {
  return (
    <>
      <PublicNav />

      <header className="public-static-banner">
        <div className="public-static-banner-inner">
          <h1 className="public-static-title">
            Contacte
            <span className="public-static-lede">
              Suggeriments, errades, propostes de cançons o qualsevol altra cosa.
            </span>
          </h1>
        </div>
      </header>

      <main className="public-static">

        <section className="public-static-section">
          <h2>Email</h2>
          <p>
            <em>(Placeholder)</em>{" "}
            <a href="mailto:hola@guitarreo.cat">hola@guitarreo.cat</a>
          </p>
        </section>

        <section className="public-static-section">
          <h2>Qui som</h2>
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
          <h2>Formulari de contacte</h2>
          <p>
            <em>(Properament)</em> formulari per a missatges directes sense sortir de la web.
            Mentrestant, escriu-nos al correu de dalt.
          </p>
        </section>
      </main>
    </>
  )
}
