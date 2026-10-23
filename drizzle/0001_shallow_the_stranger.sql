CREATE TABLE `rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` varchar(64) NOT NULL,
	`capacity` int NOT NULL,
	`department` varchar(120),
	`building` varchar(120),
	`floor` varchar(32),
	`equipment` text,
	`accessibility` varchar(120),
	`status` enum('available','maintenance') NOT NULL DEFAULT 'available',
	`availabilityNotes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `rooms_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `session_staff` (
	`sessionId` int NOT NULL,
	`staffId` int NOT NULL,
	`assignmentRole` varchar(64) NOT NULL DEFAULT 'Lecturer',
	CONSTRAINT `session_staff_sessionId_staffId_pk` PRIMARY KEY(`sessionId`,`staffId`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectCode` varchar(32) NOT NULL,
	`subjectName` varchar(180) NOT NULL,
	`department` varchar(120),
	`academicYear` varchar(32),
	`semester` varchar(32),
	`batch` varchar(64) NOT NULL,
	`studentGroup` varchar(80),
	`classType` varchar(32) NOT NULL,
	`participantCount` int NOT NULL,
	`scheduleType` enum('routine','temporary') NOT NULL,
	`day` varchar(16) NOT NULL,
	`sessionDate` varchar(16),
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`durationMinutes` int NOT NULL,
	`repeatWeekly` int NOT NULL DEFAULT 1,
	`roomId` int,
	`requirements` text,
	`status` enum('scheduled','cancelled','rescheduled') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffCode` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`role` varchar(64) NOT NULL,
	`department` varchar(120) NOT NULL,
	`email` varchar(320),
	`telephone` varchar(32),
	`expertise` text,
	`availability` text,
	`status` enum('active','on-leave') NOT NULL DEFAULT 'active',
	`maxDailyMinutes` int NOT NULL DEFAULT 480,
	`maxWeeklyMinutes` int NOT NULL DEFAULT 2400,
	`preferredTimes` text,
	`preferredRooms` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_staffCode_unique` UNIQUE(`staffCode`)
);
--> statement-breakpoint
CREATE INDEX `rooms_type_idx` ON `rooms` (`type`);--> statement-breakpoint
CREATE INDEX `rooms_status_idx` ON `rooms` (`status`);--> statement-breakpoint
CREATE INDEX `sessions_day_idx` ON `sessions` (`day`);--> statement-breakpoint
CREATE INDEX `sessions_room_idx` ON `sessions` (`roomId`);--> statement-breakpoint
CREATE INDEX `sessions_batch_idx` ON `sessions` (`batch`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `staff_code_idx` ON `staff` (`staffCode`);--> statement-breakpoint
CREATE INDEX `staff_status_idx` ON `staff` (`status`);