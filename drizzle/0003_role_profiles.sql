ALTER TABLE `users` ADD `staffCode` varchar(32), ADD `batch` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('student','lecturer','admin') NOT NULL DEFAULT 'student';
