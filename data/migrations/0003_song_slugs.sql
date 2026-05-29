-- Migració: slugs URL-safe per cançons.
-- Afegeix `artist_slug` i `song_slug` (nullable) i un índex únic compost.
-- El backfill de valors per a les cançons existents es fa amb el script
-- `scripts/backfill-song-slugs.ts` (lògica de col·lisions complexa per a SQL pura).
ALTER TABLE songs ADD COLUMN artist_slug TEXT;
ALTER TABLE songs ADD COLUMN song_slug TEXT;
CREATE UNIQUE INDEX songs_artist_song_slug_unique ON songs(artist_slug, song_slug);
