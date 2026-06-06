CREATE TABLE `canconer_songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`canconer_id` integer NOT NULL,
	`song_id` integer NOT NULL,
	`semitones` integer DEFAULT 0,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`canconer_id`) REFERENCES `canconers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `canconers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text DEFAULT 'El meu cançoner' NOT NULL,
	`share_token` text,
	`style` text DEFAULT 'classic' NOT NULL,
	`accent_color` text,
	`pdf_options` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canconers_share_token_unique` ON `canconers` (`share_token`);--> statement-breakpoint
CREATE TABLE `song_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`song_id` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`reviewer_id` integer,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`reviewed_at` text,
	`resubmitted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`artist_slug` text,
	`song_slug` text,
	`key` text NOT NULL,
	`capo` integer DEFAULT 0,
	`content` text NOT NULL,
	`language` text DEFAULT 'ca',
	`tags` text DEFAULT '',
	`album` text,
	`year` integer,
	`youtube_url` text,
	`spotify_url` text,
	`state` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_artist_song_slug_unique` ON `songs` (`artist_slug`,`song_slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`google_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`google_name` text,
	`avatar_url` text,
	`role` text DEFAULT 'user',
	`active` integer DEFAULT 1,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);