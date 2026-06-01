"use client"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { useToastStore } from "@/hooks/useToasts"
import { getT } from "@/lib/i18n"

const MOBILE_GATE_QUERY = "(max-width: 720px)"

/**
 * Retorna true si l'amplada actual de la pantalla és la de mòbil. Servidor:
 * retorna false (per evitar mismatches d'hidratació; l'usuari no veurà
 * cap canvi perquè el handler només actua al click, que ja és client-side).
 */
export function isMobileGate(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(MOBILE_GATE_QUERY).matches
}

/** Mostra el toast estàndard del gate de mòbil. */
export function showMobileGateToast(): void {
  const t = getT()
  useToastStore.getState().show(t.public.mobileGate.noDisponibleMobil, { durationMs: 3500 })
}

/** Si som a mòbil, mostra el toast i retorna true (caller hauria d'aturar la
 *  navegació). Altrament retorna false. Útil dins handlers tipus
 *  `router.push("/app")`. */
export function guardMobileApp(): boolean {
  if (!isMobileGate()) return false
  showMobileGateToast()
  return true
}

type Props = ComponentProps<typeof Link> & { children: ReactNode }

/**
 * Wrapper de <Link> que en pantalles mòbils intercepta el click i mostra un
 * toast en comptes de navegar. A escriptori es comporta com un Link normal.
 */
export function MobileGateLink({ children, onClick, ...rest }: Props) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        if (isMobileGate()) {
          e.preventDefault()
          showMobileGateToast()
          return
        }
        onClick?.(e)
      }}
    >
      {children}
    </Link>
  )
}
