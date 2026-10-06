import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  mediumtext,
  timestamp,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 180 }),
  mustChangePassword: int("mustChangePassword").default(1).notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["student", "lecturer", "admin"]).default("student").notNull(),
  roleTitle: varchar("roleTitle", { length: 80 }),
  studentId: varchar("studentId", { length: 80 }),
  registrationNo: varchar("registrationNo", { length: 80 }),
  academicYear: varchar("academicYear", { length: 20 }),
  phone: varchar("phone", { length: 40 }),
  qualifications: text("qualifications"),
  staffCode: varchar("staffCode", { length: 32 }),
  batch: varchar("batch", { length: 64 }),
  /** Degree programme of a student: IT or AMC */
  program: varchar("program", { length: 16 }),
  /** Current level (year of study) of a student: 1-4 */
  level: int("level"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Declared course catalogue (one row per course unit). */
export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    credits: int("credits").default(0).notNull(),
    /** IT, AMC or COMMON (shared by both programmes) */
    program: varchar("program", { length: 16 }).default("IT").notNull(),
    level: int("level").default(1).notNull(),
    semester: int("semester").default(1).notNull(),
    /** core | elective | optional */
    category: varchar("category", { length: 16 }).default("core").notNull(),
    theoryHours: int("theoryHours").default(0).notNull(),
    practicalHours: int("practicalHours").default(0).notNull(),
    weeklyHours: int("weeklyHours").default(0).notNull(),
    expectedStudents: int("expectedStudents"),
    preferredRoomId: int("preferredRoomId"),
    practicalRoomId: int("practicalRoomId"),
    description: text("description"),
    objective: text("objective"),
    learningOutcomes: text("learningOutcomes"),
    contents: text("contents"),
    prerequisites: varchar("prerequisites", { length: 255 }),
    teachingMethods: text("teachingMethods"),
    evaluation: text("evaluation"),
    readings: text("readings"),
    creditDetail: varchar("creditDetail", { length: 200 }),
    active: int("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    cohortIdx: index("courses_cohort_idx").on(t.level, t.semester),
  })
);

/** Which lecturers teach which course (lecturer assignment). */
export const courseLecturers = mysqlTable(
  "course_lecturers",
  {
    courseId: int("courseId").notNull(),
    staffId: int("staffId").notNull(),
    /** coordinator | lecturer | instructor */
    role: varchar("role", { length: 24 }).default("lecturer").notNull(),
    /** theory | practical | both */
    component: varchar("component", { length: 16 }).default("both").notNull(),
  },
  t => ({ pk: primaryKey({ columns: [t.courseId, t.staffId] }) })
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectCode: varchar("subjectCode", { length: 32 }).notNull(),
    subjectName: varchar("subjectName", { length: 180 }).notNull(),
    department: varchar("department", { length: 120 }),
    academicYear: varchar("academicYear", { length: 32 }),
    semester: varchar("semester", { length: 32 }),
    batch: varchar("batch", { length: 64 }).notNull(),
    studentGroup: varchar("studentGroup", { length: 80 }),
    classType: varchar("classType", { length: 32 }).notNull(),
    participantCount: int("participantCount").notNull(),
    scheduleType: mysqlEnum("scheduleType", ["routine", "temporary"]).notNull(),
    day: varchar("day", { length: 16 }).notNull(),
    sessionDate: varchar("sessionDate", { length: 16 }),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    durationMinutes: int("durationMinutes").notNull(),
    repeatWeekly: int("repeatWeekly").default(1).notNull(),
    roomId: int("roomId"),
    requirements: text("requirements"),
    status: mysqlEnum("status", ["scheduled", "cancelled", "rescheduled"]).default("scheduled").notNull(),
    notes: text("notes"),
    courseId: int("courseId"),
    program: varchar("program", { length: 16 }),
    level: int("level"),
    generationRunId: int("generationRunId"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    dayIdx: index("sessions_day_idx").on(t.day),
    roomIdx: index("sessions_room_idx").on(t.roomId),
    batchIdx: index("sessions_batch_idx").on(t.batch),
    statusIdx: index("sessions_status_idx").on(t.status),
  })
);

export const sessionStaff = mysqlTable(
  "session_staff",
  {
    sessionId: int("sessionId").notNull(),
    staffId: int("staffId").notNull(),
    assignmentRole: varchar("assignmentRole", { length: 64 }).default("Lecturer").notNull(),
  },
  t => ({ pk: primaryKey({ columns: [t.sessionId, t.staffId] }) })
);

export const staffRelations = relations(staff, ({ many }) => ({ assignments: many(sessionStaff) }));
export const roomRelations = relations(rooms, ({ many }) => ({ sessions: many(sessions) }));
export const sessionRelations = relations(sessions, ({ one, many }) => ({
  room: one(rooms, { fields: [sessions.roomId], references: [rooms.id] }),
  staff: many(sessionStaff),
}));

export const sessionExceptions = mysqlTable(
  "session_exceptions",
  {
    sessionId: int("sessionId").notNull(),
    occurrenceDate: varchar("occurrenceDate", { length: 16 }).notNull(),
    status: mysqlEnum("status", ["cancelled", "rescheduled"]).notNull().default("cancelled"),
    reason: text("reason"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    pk: primaryKey({ columns: [t.sessionId, t.occurrenceDate] }),
    sessionIdx: index("session_exceptions_session_idx").on(t.sessionId),
  })
);

export const appSettings = mysqlTable("app_settings", {
  settingKey: varchar("settingKey", { length: 120 }).primaryKey(),
  settingValue: mediumtext("settingValue").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const notices = mysqlTable(
  "notices",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    message: text("message").notNull(),
    audience: varchar("audience", { length: 16 }).default("all").notNull(),
    /** JSON array of user ids, or null for the whole audience */
    recipients: mediumtext("recipients"),
    authorId: int("authorId"),
    expiresAt: varchar("expiresAt", { length: 16 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({ createdIdx: index("notices_created_idx").on(t.createdAt) })
);

export const generationRuns = mysqlTable("generation_runs", {
  id: int("id").autoincrement().primaryKey(),
  semester: int("semester").notNull(),
  academicYear: varchar("academicYear", { length: 20 }),
  createdBy: int("createdBy"),
  scheduled: int("scheduled").default(0).notNull(),
  unscheduled: int("unscheduled").default(0).notNull(),
  report: mediumtext("report"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const timetableSwaps = mysqlTable(
  "timetable_swaps",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId").notNull(),
    requesterId: int("requesterId").notNull(),
    requestedDay: varchar("requestedDay", { length: 16 }).notNull(),
    requestedStartTime: varchar("requestedStartTime", { length: 5 }).notNull(),
    requestedEndTime: varchar("requestedEndTime", { length: 5 }).notNull(),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
    reviewerId: int("reviewerId"),
    reviewerNote: text("reviewerNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    sessionIdx: index("timetable_swaps_session_idx").on(t.sessionId),
    requesterIdx: index("timetable_swaps_requester_idx").on(t.requesterId),
    statusIdx: index("timetable_swaps_status_idx").on(t.status),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type CourseLecturer = typeof courseLecturers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionStaff = typeof sessionStaff.$inferSelect;
export type SessionException = typeof sessionExceptions.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;
export type TimetableSwap = typeof timetableSwaps.$inferSelect;
