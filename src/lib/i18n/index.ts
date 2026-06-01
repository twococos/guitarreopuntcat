// API pública del sistema d'i18n

import { ca } from "./ca"

const dictionaries = { ca }

export type Locale = keyof typeof dictionaries
export type T = typeof ca

export function getT(locale: Locale = "ca"): T {
  return dictionaries[locale]
}
