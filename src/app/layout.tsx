import type { Metadata } from "next"
import type { ReactNode } from "react"
import { AuthProvider } from "@/components/AuthProvider"
import "./globals.css"

export const metadata: Metadata = {
  title: "El Cançoner",
  description: "Cançoner personalitzable amb transposició i generació de PDF",
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
