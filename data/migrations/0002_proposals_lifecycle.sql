-- Migració: cicle de vida ampliat de propostes.
-- 1) Afegeix estat 'cancelled' a song_proposals.status (CHECK implicit a TS).
--    SQLite no aplica enum, només cal ampliar el conjunt valid a TypeScript.
-- 2) Afegeix camp resubmitted_at (text, nullable) per a propostes
--    rebutjades que l'usuari ha modificat i re-enviat.
ALTER TABLE song_proposals ADD COLUMN resubmitted_at TEXT;
