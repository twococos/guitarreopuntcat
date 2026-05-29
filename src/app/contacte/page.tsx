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
      <main className="public-static">
        <header className="public-static-header">
          <p className="public-static-eyebrow">Contacte</p>
          <h1 className="public-static-title">Posa&apos;t en contacte</h1>
          <p className="public-static-lede">
            Suggeriments, errades, propostes de cançons o qualsevol altra cosa: escolta sempre.
          </p>
        </header>

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
