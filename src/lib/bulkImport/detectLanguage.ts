import "server-only"
import { franc } from "franc"

/**
 * Detecció d'idioma per a metadades de cançons. Fem servir `franc` (no
 * `franc-min`) perquè aquest darrer NO inclou català al seu conjunt de
 * 82 llengües i marca tot el contingut català com a espanyol.
 *
 * Restringim el detector a 7 llengües (les úniques que tenim sentit
 * d'esperar al cançoner). Sense aquest whitelist franc retorna sovint
 * codis ISO 639-3 d'idiomes minoritaris ("zlm", "run"…) per text molt curt.
 *
 * Mapatge ISO 639-3 → codi curt que fa servir la resta del sistema
 * (mateixos codis que `languageFromHtml` als importadors):
 *   cat → ca · spa → es · eng → en · por → pt
 *   fra → fr · ita → it · deu → de
 *
 * Tornem null quan franc no està segur (`und`) per no sobreescriure el
 * camp amb soroll. El cridador ha de tractar null com a "no detectat".
 */

const ALLOWED_ISO3 = ["cat", "spa", "eng", "por", "fra", "ita", "deu"] as const

const ISO3_TO_SHORT: Record<string, string> = {
  cat: "ca",
  spa: "es",
  eng: "en",
  por: "pt",
  fra: "fr",
  ita: "it",
  deu: "de",
}

/**
 * Detecta l'idioma a partir d'una sèrie de fragments de text (artista,
 * títol, àlbum). Els concatena per donar a franc el màxim de senyal —
 * els títols sols són sovint massa curts per a una detecció fiable.
 *
 * Retorna el codi curt (ca/es/en/pt/fr/it/de) o null si no hi ha prou
 * informació o franc no està segur.
 */
export function detectSongLanguage(...parts: (string | null | undefined)[]): string | null {
  const text = parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(" ")
    .trim()
  if (text.length < 3) return null

  const iso3 = franc(text, {
    minLength: 3,
    only: [...ALLOWED_ISO3],
  })

  if (iso3 === "und") return null
  return ISO3_TO_SHORT[iso3] ?? null
}
