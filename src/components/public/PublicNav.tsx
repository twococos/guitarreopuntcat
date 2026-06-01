"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState } from "react"
import { UserWidget } from "@/components/UserWidget"
import { SearchHero } from "@/components/public/SearchHero"
import { LoginPopup } from "@/components/LoginPopup"
import { MobileGateLink } from "@/components/public/MobileGateLink"
import { getT } from "@/lib/i18n"

/**
 * PublicNav — barra de navegació de l'àrea pública.
 *
 * Layout (escriptori): a banda i banda del contingut central (alineat amb els
 * marges de la pàgina, max-width 900px) hi van el logo i les accions (CTA o
 * UserWidget). Al centre, els enllaços de pestanya a l'esquerra i la cerca
 * a la dreta.
 *
 * Excepció: a "/" (portada), no hi ha cerca; en el seu lloc apareix el botó
 * "Inicia sessió" (quan no autenticat).
 *
 * Comportament d'autenticació:
 *   · Autenticat → UserWidget a la dreta, sense CTA "Crea un cançoner".
 *   · No autenticat → CTA "Crea un cançoner" a la dreta. A "/", a més,
 *     botó "Inicia sessió" al centre.
 */
export function PublicNav() {
  const t = getT()
  const pathname = usePathname() || "/"
  const { data: session, status } = useSession()
  const [showLogin, setShowLogin] = useState(false)

  const isHome = pathname === "/"
  const isSongs = pathname === "/songs" || pathname.startsWith("/songs/")
  const isProjecte = pathname.startsWith("/projecte")
  const isContacte = pathname.startsWith("/contacte")

  const authed = !!session?.user

  return (
    <>
      <div className="search-hero-backdrop" aria-hidden="true" />
      <header className="public-nav">
        <div className="public-nav-inner">
          <Link href="/" className="public-nav-brand" aria-label={t.public.nav.inici}>
            <img src="/img/Logo.png" alt="" className="public-nav-logo" />
            <span className="public-nav-wordmark">{t.public.nav.wordmark}</span>
          </Link>

          <div className="public-nav-mid">
            <nav className="public-nav-links" aria-label={t.public.nav.navPrincipal}>
              <Link
                href="/"
                className={`public-nav-link public-nav-link-home ${isHome ? "is-active" : ""}`}
              >
                {t.public.nav.inici}
              </Link>
              <Link
                href="/songs"
                className={`public-nav-link ${isSongs ? "is-active" : ""}`}
              >
                {t.public.nav.cancons}
              </Link>
              <Link
                href="/projecte"
                className={`public-nav-link ${isProjecte ? "is-active" : ""}`}
              >
                {t.public.nav.elProjecte}
              </Link>
              <Link
                href="/contacte"
                className={`public-nav-link ${isContacte ? "is-active" : ""}`}
              >
                {t.public.nav.contacte}
              </Link>
            </nav>

            {/* A la portada no hi ha cerca; mostrem "Inicia sessió" si no autenticat. */}
            {isHome ? (
              !authed && status !== "loading" ? (
                <button
                  type="button"
                  className="public-nav-login"
                  onClick={() => setShowLogin(true)}
                >
                  <img src="/img/google.svg" alt="" />
                  {t.public.nav.iniciaSessio}
                </button>
              ) : null
            ) : (
              <div className="public-nav-search">
                <SearchHero
                  compact
                  expandOnFocus
                  placeholder={t.public.nav.cercaPlaceholder}
                />
              </div>
            )}
          </div>

          <div className="public-nav-actions">
            {authed ? (
              <UserWidget />
            ) : (
              <MobileGateLink href="/app" className="public-nav-cta">
                {t.public.mobileGate.creaCanconerCta}
              </MobileGateLink>
            )}
          </div>
        </div>
      </header>
      {showLogin && <LoginPopup onClose={() => setShowLogin(false)} />}
    </>
  )
}
