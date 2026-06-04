-- Migració: Afegeix `google_name` a `users` per a preservar el nom original
-- importat de Google encara que l'usuari editi el seu nom mostrat.
-- Backfill: copia el `name` actual com a `google_name` per als usuaris existents.
ALTER TABLE users ADD COLUMN google_name TEXT;
UPDATE users SET google_name = name WHERE google_name IS NULL;
