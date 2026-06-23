CREATE TABLE `news_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dedup_key` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source` text,
	`published_at` text,
	`description` text,
	`image_url` text,
	`language` text,
	`provider` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`fetched_at` text NOT NULL,
	`delivered_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_dedup_key_unique` ON `news_items` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `news_items_published_at_idx` ON `news_items` (`published_at`);--> statement-breakpoint
CREATE INDEX `news_items_delivered_at_idx` ON `news_items` (`delivered_at`);