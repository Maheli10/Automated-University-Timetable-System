import { sql } from "drizzle-orm";

/**
 * Self-healing database schema.
 *
 * The project historically accumulated several conflicting drizzle migration
 * files, which made `drizzle-kit migrate` fail on some machines. Instead, every
 * table is created here with `CREATE TABLE IF NOT EXISTS`, and any missing
 * column is added. This runs automatically on server start and through
 * `pnpm db:push`, so a fresh XAMPP database and an old one both end up with
 * the same structure without manual SQL.
 */

type ColumnMap = Record<string, string>;

const tables: Record<string, { create: string; columns: ColumnMap }> = {
  users: {
    create: `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`openId\` varchar(64) NOT NULL,
      \`name\` text,
      \`email\` varchar(320),
      \`loginMethod\` varchar(64),
      \`role\` enum('student','lecturer','admin') NOT NULL DEFAULT 'student',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
    )`,
    columns: {
      passwordHash: "varchar(180) NULL",
      mustChangePassword: "int NOT NULL DEFAULT 1",
      roleTitle: "varchar(80) NULL",
      studentId: "varchar(80) NULL",
      registrationNo: "varchar(80) NULL",
      academicYear: "varchar(20) NULL",
      phone: "varchar(40) NULL",
      qualifications: "text NULL",
      staffCode: "varchar(32) NULL",
      batch: "varchar(64) NULL",
      program: "varchar(16) NULL",
      level: "int NULL",
    },
  },
  staff: {
    create: `CREATE TABLE IF NOT EXISTS \`staff\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`staffCode\` varchar(32) NOT NULL,
      \`name\` varchar(160) NOT NULL,
      \`role\` varchar(64) NOT NULL,
      \`department\` varchar(120) NOT NULL,
      \`email\` varchar(320),
      \`telephone\` varchar(32),
      \`expertise\` text,
      \`availability\` text,
      \`status\` enum('active','on-leave') NOT NULL DEFAULT 'active',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`staff_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`staff_staffCode_unique\` UNIQUE(\`staffCode\`)
    )`,
    columns: {
      qualification: "text NULL",
      maxDailyMinutes: "int NOT NULL DEFAULT 480",
      maxWeeklyMinutes: "int NOT NULL DEFAULT 2400",
      preferredTimes: "text NULL",
      preferredRooms: "text NULL",
    },
  },
  rooms: {
    create: `CREATE TABLE IF NOT EXISTS \`rooms\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`code\` varchar(32) NOT NULL,
      \`name\` varchar(160) NOT NULL,
      \`type\` varchar(64) NOT NULL,
      \`capacity\` int NOT NULL,
      \`department\` varchar(120),
      \`building\` varchar(120),
      \`floor\` varchar(32),
      \`equipment\` text,
      \`accessibility\` varchar(120),
      \`status\` enum('available','maintenance') NOT NULL DEFAULT 'available',
      \`availabilityNotes\` text,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`rooms_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`rooms_code_unique\` UNIQUE(\`code\`)
    )`,
    columns: {},
  },
  courses: {
    create: `CREATE TABLE IF NOT EXISTS \`courses\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`code\` varchar(32) NOT NULL,
      \`name\` varchar(200) NOT NULL,
      \`credits\` int NOT NULL DEFAULT 0,
      \`program\` varchar(16) NOT NULL DEFAULT 'IT',
      \`level\` int NOT NULL DEFAULT 1,
      \`semester\` int NOT NULL DEFAULT 1,
      \`category\` varchar(16) NOT NULL DEFAULT 'core',
      \`theoryHours\` int NOT NULL DEFAULT 0,
      \`practicalHours\` int NOT NULL DEFAULT 0,
      \`weeklyHours\` int NOT NULL DEFAULT 0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`courses_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`courses_code_unique\` UNIQUE(\`code\`)
    )`,
    columns: {
      expectedStudents: "int NULL",
      preferredRoomId: "int NULL",
      practicalRoomId: "int NULL",
      description: "text NULL",
      objective: "text NULL",
      learningOutcomes: "text NULL",
      contents: "text NULL",
      prerequisites: "varchar(255) NULL",
      teachingMethods: "text NULL",
      evaluation: "text NULL",
      readings: "text NULL",
      creditDetail: "varchar(200) NULL",
      active: "int NOT NULL DEFAULT 1",
    },
  },
  course_lecturers: {
    create: `CREATE TABLE IF NOT EXISTS \`course_lecturers\` (
      \`courseId\` int NOT NULL,
      \`staffId\` int NOT NULL,
      \`role\` varchar(24) NOT NULL DEFAULT 'lecturer',
      \`component\` varchar(16) NOT NULL DEFAULT 'both',
      CONSTRAINT \`course_lecturers_pk\` PRIMARY KEY(\`courseId\`,\`staffId\`)
    )`,
    columns: {},
  },
  sessions: {
    create: `CREATE TABLE IF NOT EXISTS \`sessions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`subjectCode\` varchar(32) NOT NULL,
      \`subjectName\` varchar(180) NOT NULL,
      \`department\` varchar(120),
      \`academicYear\` varchar(32),
      \`semester\` varchar(32),
      \`batch\` varchar(64) NOT NULL,
      \`studentGroup\` varchar(80),
      \`classType\` varchar(32) NOT NULL,
      \`participantCount\` int NOT NULL,
      \`scheduleType\` enum('routine','temporary') NOT NULL,
      \`day\` varchar(16) NOT NULL,
      \`sessionDate\` varchar(16),
      \`startTime\` varchar(5) NOT NULL,
      \`endTime\` varchar(5) NOT NULL,
      \`durationMinutes\` int NOT NULL,
      \`repeatWeekly\` int NOT NULL DEFAULT 1,
      \`roomId\` int,
      \`requirements\` text,
      \`status\` enum('scheduled','cancelled','rescheduled') NOT NULL DEFAULT 'scheduled',
      \`notes\` text,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`sessions_id\` PRIMARY KEY(\`id\`)
    )`,
    columns: {
      courseId: "int NULL",
      program: "varchar(16) NULL",
      level: "int NULL",
      generationRunId: "int NULL",
    },
  },
  session_staff: {
    create: `CREATE TABLE IF NOT EXISTS \`session_staff\` (
      \`sessionId\` int NOT NULL,
      \`staffId\` int NOT NULL,
      \`assignmentRole\` varchar(64) NOT NULL DEFAULT 'Lecturer',
      CONSTRAINT \`session_staff_sessionId_staffId_pk\` PRIMARY KEY(\`sessionId\`,\`staffId\`)
    )`,
    columns: {},
  },
  session_exceptions: {
    create: `CREATE TABLE IF NOT EXISTS \`session_exceptions\` (
      \`sessionId\` int NOT NULL,
      \`occurrenceDate\` varchar(16) NOT NULL,
      \`status\` enum('cancelled','rescheduled') NOT NULL DEFAULT 'cancelled',
      \`reason\` text,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`session_exceptions_pk\` PRIMARY KEY(\`sessionId\`,\`occurrenceDate\`)
    )`,
    columns: {},
  },
  app_settings: {
    create: `CREATE TABLE IF NOT EXISTS \`app_settings\` (
      \`settingKey\` varchar(120) NOT NULL,
      \`settingValue\` mediumtext NOT NULL,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`app_settings_settingKey\` PRIMARY KEY(\`settingKey\`)
    )`,
    columns: {},
  },
  notices: {
    create: `CREATE TABLE IF NOT EXISTS \`notices\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`title\` varchar(200) NOT NULL,
      \`message\` text NOT NULL,
      \`audience\` varchar(16) NOT NULL DEFAULT 'all',
      \`recipients\` mediumtext,
      \`authorId\` int,
      \`expiresAt\` varchar(16),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`notices_id\` PRIMARY KEY(\`id\`)
    )`,
    columns: {},
  },
  generation_runs: {
    create: `CREATE TABLE IF NOT EXISTS \`generation_runs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`semester\` int NOT NULL,
      \`academicYear\` varchar(20),
      \`createdBy\` int,
      \`scheduled\` int NOT NULL DEFAULT 0,
      \`unscheduled\` int NOT NULL DEFAULT 0,
      \`report\` mediumtext,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`generation_runs_id\` PRIMARY KEY(\`id\`)
    )`,
    columns: {},
  },
  timetable_swaps: {
    create: `CREATE TABLE IF NOT EXISTS \`timetable_swaps\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`sessionId\` int NOT NULL,
      \`requesterId\` int NOT NULL,
      \`requestedDay\` varchar(16) NOT NULL,
      \`requestedStartTime\` varchar(5) NOT NULL,
      \`requestedEndTime\` varchar(5) NOT NULL,
      \`reason\` text NOT NULL,
      \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      \`reviewerId\` int,
      \`reviewerNote\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`timetable_swaps_id\` PRIMARY KEY(\`id\`)
    )`,
    columns: {},
  },
};

function rowsOf(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

async function existingColumns(db: any, database: string, table: string) {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT column_name AS name, data_type AS type
      FROM information_schema.columns
      WHERE table_schema = ${database} AND table_name = ${table}
    `)
  );
  return new Map<string, string>(
    rows.map((row: any) => [
      String(row.name ?? row.COLUMN_NAME),
      String(row.type ?? row.DATA_TYPE).toLowerCase(),
    ])
  );
}

export async function ensureSchema(db: any, databaseUrl: string) {
  const database = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, "")
  );
  if (!database) return;
  for (const [table, definition] of Object.entries(tables)) {
    await db.execute(sql.raw(definition.create));
    const present = await existingColumns(db, database, table);
    for (const [column, type] of Object.entries(definition.columns)) {
      if (!present.has(column))
        await db.execute(
          sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`)
        );
    }
    if (table === "users") {
      await db.execute(
        sql.raw("UPDATE users SET `role` = 'student' WHERE `role` = 'user'")
      );
      await db.execute(
        sql.raw(
          "ALTER TABLE users MODIFY COLUMN `role` enum('student','lecturer','admin') NOT NULL DEFAULT 'student'"
        )
      );
    }
    if (table === "app_settings" && present.get("settingValue") === "text") {
      await db.execute(
        sql.raw(
          "ALTER TABLE app_settings MODIFY COLUMN `settingValue` mediumtext NOT NULL"
        )
      );
    }
  }
  await migrateLegacyJson(db);
}

/** Move data that older versions stored as JSON blobs into real tables. */
async function migrateLegacyJson(db: any) {
  const settingRows = rowsOf(
    await db.execute(
      sql.raw(
        "SELECT settingKey, settingValue FROM app_settings WHERE settingKey IN ('courses','notices')"
      )
    )
  );
  const courseCount = Number(
    rowsOf(await db.execute(sql.raw("SELECT COUNT(*) AS n FROM courses")))[0]
      ?.n ?? 0
  );
  for (const row of settingRows) {
    let value: any[] = [];
    try {
      value = JSON.parse(row.settingValue);
    } catch {
      value = [];
    }
    if (!Array.isArray(value)) value = [];
    if (row.settingKey === "courses" && courseCount === 0 && value.length) {
      const { normalizeCourseRow } = await import("../shared/courseCode");
      for (const legacy of value) {
        const course = normalizeCourseRow(legacy);
        if (!course) continue;
        await db.execute(sql`
          INSERT IGNORE INTO courses (code, name, credits, program, level, semester, category, theoryHours, practicalHours, weeklyHours)
          VALUES (${course.code}, ${course.name}, ${course.credits}, ${course.program}, ${course.level}, ${course.semester}, ${course.category}, ${course.theoryHours}, ${course.practicalHours}, ${course.weeklyHours})
        `);
      }
      await db.execute(
        sql.raw("DELETE FROM app_settings WHERE settingKey = 'courses'")
      );
    }
    if (row.settingKey === "notices") {
      for (const notice of value.slice(0, 500)) {
        if (!notice?.title || !notice?.message) continue;
        await db.execute(sql`
          INSERT INTO notices (title, message, audience, recipients, authorId, expiresAt)
          VALUES (${String(notice.title).slice(0, 200)}, ${String(notice.message)}, ${String(notice.audience || "all")}, ${notice.recipientUserIds?.length ? JSON.stringify(notice.recipientUserIds) : null}, ${notice.authorId ?? null}, ${notice.expiresAt || null})
        `);
      }
      await db.execute(
        sql.raw("DELETE FROM app_settings WHERE settingKey = 'notices'")
      );
    }
  }
}
