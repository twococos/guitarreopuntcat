CREATE TABLE `song_analyses` (
	`song_id` integer PRIMARY KEY NOT NULL,
	`job_id` integer,
	`youtube_id` text,
	`duration_s` real NOT NULL,
	`format_version` integer NOT NULL,
	`app_version` text,
	`device` text,
	`lyrics_source` text,
	`analysis` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `transcription_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `transcription_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text DEFAULT 'new' NOT NULL,
	`source_url` text NOT NULL,
	`title` text,
	`artist` text,
	`language` text,
	`lyrics_text` text,
	`song_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`worker_id` integer,
	`lease_until` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`not_before` text,
	`error` text,
	`result_song_id` integer,
	`elapsed_seconds` real,
	`created_by` integer,
	`created_at` text DEFAULT (datetime('now')),
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`worker_id`) REFERENCES `transcription_workers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transcription_jobs_status_idx` ON `transcription_jobs` (`status`,`priority`,`id`);--> statement-breakpoint
CREATE TABLE `transcription_workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`device_info` text,
	`app_version` text,
	`last_seen_at` text,
	`jobs_done` integer DEFAULT 0 NOT NULL,
	`avg_seconds` real,
	`created_by` integer,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcription_workers_token_hash_unique` ON `transcription_workers` (`token_hash`);--> statement-breakpoint
ALTER TABLE `songs` ADD `bpm` integer;--> statement-breakpoint
ALTER TABLE `songs` ADD `time_signature` text;