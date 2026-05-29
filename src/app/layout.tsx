import type { Metadata } from "next"
import type { ReactNode } from "react"
import { AuthProvider } from "@/components/AuthProvider"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "guitarreo.cat — Acords i lletres en català",
    template: "%s",
  },
  description:
    "Acords, lletres i cançoners personalitzats en català. Cerca cançons, transposa-les i crea el teu llibret en PDF.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning: algunes extensions del navegador (Dark Reader,
  // Grammarly, etc.) injecten classes/atributs al <html> abans que React hidrati,
  // causant un warning innòs de mismatch. Aquest flag silencia només aquesta
  // capa, no els mismatches reals del nostre codi.
  return (
    <html lang="ca" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
