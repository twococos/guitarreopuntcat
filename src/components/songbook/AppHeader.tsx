"use client"
import Link from "next/link"
import type { ReactNode } from "react"
import { getT } from "@/lib/i18n"

interface AppHeaderProps {
  /** Subtítol contextual (ex: "Cançoner", "Biblioteca", "Administració"). */
  subtitle: string
  /** Accions a la dreta (ex: UserWidget, NewSongButton). */
  actions?: ReactNode
  /** Si es passa, mostra un enllaç "enrere" abans del brand. */
  backLink?: { href: string; label: string }
}

/**
 * Capçalera homogènia per a les pàgines de /app.
 *
 * Mostra el logo + wordmark "guitarreo.cat" (igual que PublicNav) seguit
 * d'un separador "/" i el subtítol contextual de la pàgina. Reutilitza
 * el wordmark del diccionari i18n existent (t.public.nav.wordmark).
 */
export function AppHeader({ subtitle, actions, backLink }: AppHeaderProps) {
  const t = getT()
  return (
    <header className="app-header">
      {backLink && (
        <Link href={backLink.href} className="back-link">
          {backLink.label}
        </Link>
      )}
      <Link href="/" className="app-header-brand" aria-label={t.public.nav.wordmark}>
        <img src="/img/Logo.png" alt="" className="app-header-logo" />
        <span className="app-header-wordmark">{t.public.nav.wordmark}</span>
      </Link>
      <span className="app-header-sep" aria-hidden="true">
        /
      </span>
      <span className="app-header-subtitle">{subtitle}</span>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  )
}
