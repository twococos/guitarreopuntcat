CREATE TABLE `song_chord_sources` (
	`song_id` integer NOT NULL,
	`url` text NOT NULL,
	`site` text NOT NULL,
	`manual` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`votes` integer,
	`fit` real,
	`matched` real,
	`weight` real DEFAULT 0 NOT NULL,
	`group_id` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`song_id`, `url`),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `song_chord_sources_song_idx` ON `song_chord_sources` (`song_id`);