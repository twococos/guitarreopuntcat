ALTER TABLE `song_analyses` ADD `transcriber_content` text;--> statement-breakpoint
-- Cançons creades pel transcriptor: el content actual es pren com l'original (sense historial
-- d'edicions no es pot saber si algú les ha tocat; decisió de l'admin, 2026-11-08)
UPDATE `song_analyses` SET `transcriber_content` = (SELECT `content` FROM `songs` WHERE `songs`.`id` = `song_analyses`.`song_id`)
WHERE `song_id` IN (SELECT `result_song_id` FROM `transcription_jobs` WHERE `mode` = 'new' AND `status` = 'done' AND `result_song_id` IS NOT NULL);
