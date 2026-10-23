ALTER TABLE `users` ADD `passwordHash` varchar(180);
--> statement-breakpoint
CREATE TABLE `timetable_swaps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `requesterId` int NOT NULL,
  `requestedDay` varchar(16) NOT NULL,
  `requestedStartTime` varchar(5) NOT NULL,
  `requestedEndTime` varchar(5) NOT NULL,
  `reason` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewerId` int,
  `reviewerNote` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `timetable_swaps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `timetable_swaps_session_idx` ON `timetable_swaps` (`sessionId`);
--> statement-breakpoint
CREATE INDEX `timetable_swaps_requester_idx` ON `timetable_swaps` (`requesterId`);
--> statement-breakpoint
CREATE INDEX `timetable_swaps_status_idx` ON `timetable_swaps` (`status`);
