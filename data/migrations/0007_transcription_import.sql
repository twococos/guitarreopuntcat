CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `transcription_jobs` ADD `spotify_url` text;--> statement-breakpoint
ALTER TABLE `transcription_jobs` ADD `album` text;--> statement-breakpoint
ALTER TABLE `transcription_jobs` ADD `year` integer;--> statement-breakpoint
ALTER TABLE `transcription_jobs` ADD `duration_s` real;--> statement-breakpoint
-- Els intents passen a comptar en assignar la feina a un worker: les que un worker
-- ja havia agafat sense que el claim quedés comptat en sumen un.
UPDATE `transcription_jobs` SET `attempts` = `attempts` + 1
WHERE `status` IN ('done', 'running') OR (`status` = 'failed' AND `error` LIKE 'Ja existeix%');
