ALTER TABLE `canconers` ADD `visibility` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `canconers` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `canconers` ADD `published_at` text;--> statement-breakpoint
CREATE INDEX `canconers_visibility_idx` ON `canconers` (`visibility`,`published_at`);--> statement-breakpoint
ALTER TABLE `song_analyses` ADD `sync_quality` text;--> statement-breakpoint
ALTER TABLE `song_analyses` ADD `sync_hash` text;--> statement-breakpoint
ALTER TABLE `songs` ADD `owner_id` integer REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `songs` ADD `original_song_id` integer REFERENCES songs(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `songs_state_idx` ON `songs` (`state`);--> statement-breakpoint
CREATE INDEX `songs_owner_idx` ON `songs` (`owner_id`,`state`);--> statement-breakpoint
CREATE INDEX `songs_original_idx` ON `songs` (`original_song_id`);--> statement-breakpoint
-- Backfill: el propietari de les propostes (i de les rebutjades/cancel·lades,
-- que passen a privades) és qui les va proposar.
UPDATE `songs` SET `owner_id` = (
  SELECT `p`.`user_id` FROM `song_proposals` `p` WHERE `p`.`song_id` = `songs`.`id` ORDER BY `p`.`id` DESC LIMIT 1
) WHERE `state` IN (2, 3, 4);--> statement-breakpoint
-- Els estats 3 (rebutjada) i 4 (cancel·lada) desapareixen: ara són privades.
-- L'historial queda a song_proposals.status.
UPDATE `songs` SET `state` = 1 WHERE `state` IN (3, 4);
