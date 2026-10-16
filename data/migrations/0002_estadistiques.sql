ALTER TABLE `transcription_jobs` ADD `stats` text;--> statement-breakpoint
CREATE INDEX `transcription_jobs_worker_idx` ON `transcription_jobs` (`worker_id`,`status`,`finished_at`);