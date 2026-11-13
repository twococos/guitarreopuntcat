ALTER TABLE `song_analyses` ADD `force_content` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `song_analyses` ADD `replaced_content` text;--> statement-breakpoint
-- Una sola vegada: les cançons que ja tenen anàlisi adopten el content de la propera actualització
-- del transcriptor (abans de 0009 no se'n guardava l'original i no s'actualitzaven mai)
UPDATE `song_analyses` SET `force_content` = 1;
