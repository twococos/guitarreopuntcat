CREATE TABLE `blocked_ips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_hash` text NOT NULL,
	`reason` text,
	`blocked_at` text DEFAULT (datetime('now')),
	`blocked_by` integer,
	`expires_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocked_ips_hash_unique` ON `blocked_ips` (`ip_hash`);--> statement-breakpoint
CREATE TABLE `daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`metric` text NOT NULL,
	`dimension` text DEFAULT '_total' NOT NULL,
	`value` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_stats_unique` ON `daily_stats` (`date`,`metric`,`dimension`);--> statement-breakpoint
CREATE INDEX `daily_stats_metric_date_idx` ON `daily_stats` (`metric`,`date`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` integer,
	`ts` text DEFAULT (datetime('now')),
	`type` text NOT NULL,
	`path` text,
	`method` text,
	`status` integer,
	`ip_hash` text NOT NULL,
	`ip_raw` text,
	`referrer` text,
	`metadata` text,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE INDEX `events_ts_idx` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `events_type_ts_idx` ON `events` (`type`,`ts`);--> statement-breakpoint
CREATE INDEX `events_session_id_idx` ON `events` (`session_id`);--> statement-breakpoint
CREATE INDEX `events_user_id_ts_idx` ON `events` (`user_id`,`ts`);--> statement-breakpoint
CREATE INDEX `events_path_idx` ON `events` (`path`);--> statement-breakpoint
CREATE INDEX `events_ip_hash_ts_idx` ON `events` (`ip_hash`,`ts`);--> statement-breakpoint
CREATE TABLE `ip_buckets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_hash` text NOT NULL,
	`bucket_minute` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`flagged` integer DEFAULT 0 NOT NULL,
	`country` text,
	`last_ip_raw` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ip_buckets_hash_minute_unique` ON `ip_buckets` (`ip_hash`,`bucket_minute`);--> statement-breakpoint
CREATE INDEX `ip_buckets_flagged_idx` ON `ip_buckets` (`flagged`,`bucket_minute`);--> statement-breakpoint
CREATE TABLE `salts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`salt` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salts_date_unique` ON `salts` (`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` integer,
	`first_seen` text DEFAULT (datetime('now')),
	`last_seen` text DEFAULT (datetime('now')),
	`ua_raw` text,
	`ua_browser` text,
	`ua_os` text,
	`ua_device` text,
	`country` text,
	`is_bot` integer DEFAULT 0 NOT NULL,
	`bot_kind` text,
	`entry_path` text,
	`entry_referrer` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_term` text,
	`utm_content` text,
	`viewport_w` integer,
	`viewport_h` integer,
	`language` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_id_unique` ON `sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_first_seen_idx` ON `sessions` (`first_seen`);--> statement-breakpoint
CREATE INDEX `sessions_is_bot_first_seen_idx` ON `sessions` (`is_bot`,`first_seen`);