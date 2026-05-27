-- Migració: renomena `draft` a `state` amb 5 valors enum.
-- 0 = pública, 1 = privada, 2 = pendent, 3 = rebutjada, 4 = cancel·lada
ALTER TABLE songs ADD COLUMN state INTEGER DEFAULT 0 NOT NULL;
UPDATE songs SET state = 0 WHERE draft = 0;
UPDATE songs SET state = 2 WHERE id IN (SELECT song_id FROM song_proposals WHERE status = 'pending');
UPDATE songs SET state = 3 WHERE id IN (SELECT song_id FROM song_proposals WHERE status = 'rejected');
ALTER TABLE songs DROP COLUMN draft;
