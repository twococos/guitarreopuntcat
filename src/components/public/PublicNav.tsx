"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserWidget } from "@/components/UserWidget"

/**
 * PublicNav — barra de navegació de l'àrea pública.
 *
 * Apareix a la portada, /songs/*, /projecte i /contacte. NO apareix dins
 * /app/* (l'app té la seva pròpia capçalera).
 *
 * Marca com a "actiu" el link que coincideix amb el path actual.
 */
export function PublicNav() {
  const pathname = usePathname() || "/"

  const isHome = pathname === "/"
  const isSongs = pathname === "/songs" || pathname.startsWith("/songs/")
  const isProjecte = pathname.startsWith("/projecte")
  const isContacte = pathname.startsWith("/contacte")

  return (
    <header className="public-nav">
      <div className="public-nav-inner">
        <Link href="/" className="public-nav-brand" aria-label="Inici">
          <img src="/img/Logo.png" alt="" className="public-nav-logo" />
          <span className="public-nav-wordmark">guitarreo.cat</span>
        </Link>

        <nav className="public-nav-links" aria-label="Principal">
          <Link
            href="/"
            className={`public-nav-link ${isHome ? "is-active" : ""}`}
          >
            Inici
          </Link>
          <Link
            href="/songs"
            className={`public-nav-link ${isSongs ? "is-active" : ""}`}
          >
            Cançons
          </Link>
          <Link
            href="/projecte"
            className={`public-nav-link ${isProjecte ? "is-active" : ""}`}
          >
            El projecte
          </Link>
          <Link
            href="/contacte"
            className={`public-nav-link ${isContacte ? "is-active" : ""}`}
          >
            Contacte
          </Link>
        </nav>

        <div className="public-nav-actions">
          <Link href="/app" className="public-nav-cta">
            Obre l&apos;editor
          </Link>
          <UserWidget />
        </div>
      </div>
    </header>
  )
}
