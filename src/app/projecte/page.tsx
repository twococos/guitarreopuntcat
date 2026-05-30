import type { Metadata } from "next"
import { PublicNav } from "@/components/public/PublicNav"

export const metadata: Metadata = {
  title: "El projecte — guitarreo.cat",
  description:
    "Què és guitarreo.cat, qui hi ha al darrere i per què hem fet aquest projecte de cançons amb acords en català.",
}

export default function ProjectePage() {
  return (
    <>
      <PublicNav />

      <header className="public-static-banner">
        <div className="public-static-banner-inner">
          <h1 className="public-static-title">
            El projecte
            <span className="public-static-lede">
              Una eina lliure per llegir, transposar i organitzar cançons amb acords en català.
            </span>
          </h1>
        </div>
      </header>

      <main className="public-static">

        <section className="public-static-section">
          <h2>Què és</h2>
          <p>
            <em>(Placeholder)</em> guitarreo.cat és un lloc per trobar la lletra i els
            acords de les cançons que t&apos;agraden, i per crear-te els teus propis
            cançoners imprimibles. Pots transposar qualsevol cançó a la tonalitat que
            t&apos;encaixi millor i exportar el resultat en PDF.
          </p>
        </section>

        <section className="public-static-section">
          <h2>D&apos;on ve</h2>
          <p>
            <em>(Placeholder)</em> Va començar com una eina personal per cantar amb els amics
            i ha crescut fins a esdevenir aquest petit catàleg col·laboratiu. Tothom pot
            proposar cançons noves; un equip petit les revisa abans de publicar-les.
          </p>
        </section>

        <section className="public-static-section">
          <h2>Per què</h2>
          <p>
            <em>(Placeholder)</em> Perquè cantar en català té sentit, perquè els cançoners
            de paper són bonics, i perquè un acord ben col·locat val mil paraules.
          </p>
        </section>
      </main>
    </>
  )
}
