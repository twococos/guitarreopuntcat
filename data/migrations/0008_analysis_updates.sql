CREATE TABLE `song_analysis_raw` (
	`song_id` integer PRIMARY KEY NOT NULL,
	`app_version` text,
	`data` blob NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `transcription_workers` ADD `analysis_version` text;