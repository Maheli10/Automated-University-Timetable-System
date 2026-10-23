CREATE TABLE `app_settings` (
	`settingKey` varchar(120) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_settingKey` PRIMARY KEY(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `session_exceptions` (
	`sessionId` int NOT NULL,
	`occurrenceDate` varchar(16) NOT NULL,
	`status` enum('cancelled','rescheduled') NOT NULL DEFAULT 'cancelled',
	`reason` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_exceptions_sessionId_occurrenceDate_pk` PRIMARY KEY(`sessionId`,`occurrenceDate`)
);
--> statement-breakpoint
CREATE INDEX `session_exceptions_session_idx` ON `session_exceptions` (`sessionId`);