CREATE TABLE `song_report_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` integer,
	`reviewed_at` text,
	FOREIGN KEY (`report_id`) REFERENCES `song_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `song_report_items_report_idx` ON `song_report_items` (`report_id`);--> statement-breakpoint
CREATE INDEX `song_report_items_dedupe_idx` ON `song_report_items` (`dedupe_key`,`status`);--> statement-breakpoint
CREATE TABLE `song_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`song_id` integer NOT NULL,
	`user_id` integer,
	`session_hash` text,
	`ip_hash` text,
	`content_hash` text NOT NULL,
	`semitones` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'song' NOT NULL,
	`canconer_id` integer,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`resolved_at` text,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`canconer_id`) REFERENCES `canconers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `song_reports_song_idx` ON `song_reports` (`song_id`,`status`);--> statement-breakpoint
CREATE INDEX `song_reports_session_idx` ON `song_reports` (`session_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `song_reports_ip_idx` ON `song_reports` (`ip_hash`,`created_at`);