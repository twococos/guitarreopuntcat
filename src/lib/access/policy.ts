/**
 * Decisions de producte sobre la visibilitat. Canviar-les aquí n'hi ha prou:
 * tot el codi passa per src/lib/access/songs.ts.
 */

/**
 * Un cançoner públic pot incloure cançons privades del seu autor, que es
 * veuen públicament només dins d'aquest cançoner (visor i PDF).
 *
 * Si es posa a `false`, dins un cançoner públic només s'hi veuen les
 * cançons públiques (i les pròpies de qui mira). L'enllaç de compartir
 * (/c/[token]) les continua mostrant totes: és una capacitat que el
 * propietari dona explícitament.
 */
export const PUBLIC_SONGBOOK_SHOWS_PRIVATE_SONGS = true
