import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import {
  clearSession,
  hashPassword,
  LOCAL_DEMO_USER,
  publicUser,
  setSession,
  verifyPassword,
} from "./localAuth";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getDb,
  listStaff,
  listRooms,
  listSessions,
  getAssignments,
  listSessionExceptions,
  listAppSettings,
  listCourses,
  listCourseLecturers,
  listNotices,
  listGenerationRuns,
  listUsers,
  findSession,
  staff,
  rooms,
  sessions,
  sessionStaff,
  sessionExceptions,
  appSettings,
  timetableSwaps,
  courses,
  courseLecturers,
  notices,
  generationRuns,
  getUserByEmail,
  getUserById,
  listSwaps,
  eq,
  and,
  ne,
  users,
} from "./db";
import { notifyOwner } from "./_core/notification";
import {
  constraintPolicySchema,
  parseConstraintPolicy,
  getCandidateSlots,
  overlaps,
} from "./constraints";
import {
  cohortLabel,
  cohortsFor,
  deriveStudentCohort,
  levelNumber,
  normalizeCourseRow,
  normalizeProgram,
  pick,
  programLabel,
  semesterNumber,
} from "@shared/courseCode";
import { sendEmail } from "./email";
import { ENV } from "./_core/env";
import {
  academicInput,
  academicSettings,
  currentPolicy,
  emailUsers,
  findConflicts,
  notifySessionAudience,
  publishNotice,
  requireDb,
  roomSuitable,
  saveSetting,
  sessionCohorts,
  settingJson,
  studentCanSee,
  userCohort,
} from "./services";
import {
  generateTimetable,
  type FixedSession,
  type SchedCourse,
} from "./scheduler";
import { buildAnalytics } from "./analytics";
import handbook from "./data/handbook.json";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
export const minutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};
export const intervalsOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
) => minutes(startA) < minutes(endB) && minutes(endA) > minutes(startB);

/** Two free teaching windows on the same day, used in conflict messages. */
export const suggestTimes = (input: any, active: any[]) => {
  const windows = [
    ["08:30", "10:20"],
    ["10:40", "12:30"],
    ["13:30", "15:20"],
    ["15:40", "16:35"],
  ];
  return windows
    .filter(
      ([start, end]) =>
        !active.some(
          x =>
            intervalsOverlap(
              start,
              end,
              x.session.startTime,
              x.session.endTime
            ) &&
            (x.session.batch === input.batch ||
              (input.roomId && x.session.roomId === input.roomId))
        )
    )
    .slice(0, 2)
    .map(([start, end]) => `${input.day} ${start}–${end}`);
};

type HandbookEntry = {
  code: string;
  title: string;
  credits: number | null;
  creditDetail: string;
  prerequisites: string;
  objective: string;
  learningOutcomes: string[];
  contents: string;
  teachingMethods: string;
  evaluation: string;
  readings: string[];
};
const handbookEntries = handbook as unknown as Record<string, HandbookEntry>;

const CODE_PATTERN = /[A-Z]{2,4}\s?\d{4}/g;
const codesIn = (text: string | null | undefined) =>
  Array.from(
    new Set(
      (
        String(text || "")
          .toUpperCase()
          .match(CODE_PATTERN) || []
      ).map(code => code.replace(/\s/g, ""))
    )
  );

const toJsonList = (value: unknown) => {
  if (Array.isArray(value))
    return JSON.stringify(value.map(String).filter(Boolean));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      /* not JSON */
    }
    return JSON.stringify(
      value
        .split(/\r?\n|;|•/)
        .map(item => item.trim())
        .filter(Boolean)
    );
  }
  return null;
};
export const parseList = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(/\r?\n/).filter(Boolean);
  }
};

const handbookDetails = (code: string) => {
  const entry = handbookEntries[code];
  if (!entry) return null;
  return {
    objective: entry.objective || null,
    learningOutcomes: entry.learningOutcomes?.length
      ? JSON.stringify(entry.learningOutcomes)
      : null,
    contents: entry.contents || null,
    prerequisites: entry.prerequisites
      ? entry.prerequisites.slice(0, 255)
      : null,
    teachingMethods: entry.teachingMethods || null,
    evaluation: entry.evaluation || null,
    readings: entry.readings?.length ? JSON.stringify(entry.readings) : null,
    creditDetail: entry.creditDetail ? entry.creditDetail.slice(0, 200) : null,
  };
};

async function staffForUser(user: {
  email?: string | null;
  staffCode?: string | null;
}) {
  const people = await listStaff();
  return (
    people.find(
      person =>
        user.email &&
        (person.email || "").trim().toLowerCase() ===
          user.email.trim().toLowerCase()
    ) ||
    people.find(
      person => user.staffCode && person.staffCode === user.staffCode
    ) ||
    null
  );
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access required",
    });
  return next();
});
const schedulerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "lecturer"].includes(ctx.user.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only administrators and lecturers can change timetable records",
    });
  return next();
});

/** Lecturers may only change sessions they teach. */
async function assertCanEditSession(user: any, sessionId: number) {
  if (user.role === "admin") return;
  const me = await staffForUser(user);
  const assigned = (await getAssignments()).some(
    a => a.sessionId === sessionId && me && a.staffId === me.id
  );
  if (!assigned)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You can only change sessions that you teach. Use “Request swap” for other changes.",
    });
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------
const localLoginInput = z.object({
  email: z.string().min(3),
  password: z.string().optional(),
  role: z.enum(["admin", "lecturer", "student"]).default("student"),
});
const changePasswordInput = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8),
});
const swapInput = z.object({
  sessionId: z.number().int().positive(),
  requestedDay: z.string().min(2),
  requestedStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  requestedEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().min(5),
});
const firstRunAccounts = {
  "admin@uov.local": {
    name: "UOV Administrator",
    role: "admin" as const,
    password: "Admin@12345",
    batch: null,
    staffCode: null,
  },
};
const profileInput = z.object({
  phone: z.string().max(40).optional(),
  education: z.string().max(500).optional(),
  qualifications: z.string().max(1000).optional(),
  department: z.enum(["IT", "AMC", "General"]).default("General"),
  bio: z.string().max(1000).optional(),
  photoUrl: z.string().url().max(500).optional().or(z.literal("")),
});
const noticeInput = z.object({
  title: z.string().min(2).max(200),
  message: z.string().min(2),
  audience: z.enum(["all", "student", "lecturer", "admin"]),
  expiresAt: z.string().optional(),
});
const teachingInput = z.object({
  year: z.enum(["1", "2", "3", "4"]),
  subjectCodes: z.array(z.string().min(2)).min(1),
  department: z.enum(["IT", "AMC"]),
});
const staffInput = z.object({
  staffCode: z.string().min(2),
  name: z.string().min(2),
  role: z.string().min(2),
  department: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telephone: z.string().optional(),
  qualification: z.string().optional(),
  expertise: z.string().optional(),
  availability: z.string().optional(),
  status: z.enum(["active", "on-leave"]).default("active"),
  maxDailyMinutes: z.number().int().min(60).max(720).optional(),
  maxWeeklyMinutes: z.number().int().min(60).max(4000).optional(),
});
const roomInput = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.string().min(2),
  capacity: z.number().int().positive(),
  department: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  equipment: z.string().optional(),
  accessibility: z.string().optional(),
  status: z
    .preprocess(
      value =>
        String(value ?? "available")
          .trim()
          .toLowerCase(),
      z.enum(["available", "maintenance"])
    )
    .default("available"),
  availabilityNotes: z.string().optional(),
});
const courseInput = z.object({
  code: z.string().min(3).max(32),
  name: z.string().min(2).max(200),
  credits: z.number().int().min(0).max(30),
  program: z.enum(["IT", "AMC", "COMMON"]),
  level: z.number().int().min(1).max(4),
  semester: z.number().int().min(1).max(2),
  category: z.enum(["core", "elective", "optional"]).default("core"),
  theoryHours: z.number().int().min(0).max(20),
  practicalHours: z.number().int().min(0).max(20),
  expectedStudents: z.number().int().min(0).max(2000).nullable().optional(),
  preferredRoomId: z.number().int().positive().nullable().optional(),
  practicalRoomId: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  learningOutcomes: z.array(z.string()).optional(),
  contents: z.string().nullable().optional(),
  prerequisites: z.string().max(255).nullable().optional(),
  teachingMethods: z.string().nullable().optional(),
  evaluation: z.string().nullable().optional(),
  readings: z.array(z.string()).optional(),
  active: z.boolean().default(true),
});
const userInput = z
  .object({
    openId: z.string().min(2).optional(),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8).optional(),
    role: z.enum(["admin", "lecturer", "student"]),
    roleTitle: z.string().max(80).optional(),
    studentId: z.string().max(80).optional(),
    registrationNo: z.string().max(80).optional(),
    academicYear: z.string().max(20).optional(),
    phone: z.string().max(40).optional(),
    qualifications: z.string().max(1000).optional(),
    staffCode: z.string().optional(),
    batch: z.string().optional(),
    program: z.enum(["IT", "AMC"]).nullable().optional(),
    level: z.number().int().min(1).max(4).nullable().optional(),
  })
  .superRefine((value, issue) => {
    const problem = emailProblem(value.role, value.email);
    if (problem)
      issue.addIssue({ code: "custom", path: ["email"], message: problem });
  });
function emailProblem(role: string, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
  if (
    role === "student" &&
    !/^(?:[^\s@]+@stu\.vau\.ac\.lk|20\d{2}\/[a-z]+\/[a-z0-9]+@gmail\.com|[^\s@]+@vau\.ac\.lk)$/.test(
      email
    )
  )
    return "Students must use their university email (…@stu.vau.ac.lk).";
  if (role === "lecturer" && !email.endsWith("@vau.ac.lk"))
    return "Lecturers must use their UOV email address (…@vau.ac.lk).";
  return null;
}
const contentInput = z.object({
  facultyName: z.string().min(2).default("Faculty of Applied Science"),
  universityName: z.string().min(2).default("University of Vavuniya"),
  dashboardTitle: z.string().min(2).default("Timetable operations"),
  dashboardDescription: z
    .string()
    .min(2)
    .default(
      "The operating picture for your faculty, driven by the scheduling database."
    ),
});
const notificationInput = z.object({
  enabled: z.boolean().default(true),
  events: z
    .object({
      cancellation: z.boolean().default(true),
      reschedule: z.boolean().default(true),
      rejection: z.boolean().default(true),
    })
    .default({ cancellation: true, reschedule: true, rejection: true }),
  timing: z
    .enum(["immediate", "daily-digest", "weekly-digest"])
    .default("immediate"),
  recipients: z.string().default(""),
});
type NotificationEvent = "cancellation" | "reschedule" | "rejection";
async function notifyConfigured(
  event: NotificationEvent,
  title: string,
  content: string
) {
  const preferences = notificationInput.parse(
    await settingJson<any>("notifications", {})
  );
  if (!preferences.enabled || !preferences.events[event]) return;
  if (preferences.timing !== "immediate") return;
  await notifyOwner({
    title,
    content: `${content} Recipients: ${preferences.recipients || "owner"}`,
  }).catch(() => undefined);
}

const sessionInput = z.object({
  subjectCode: z.string().min(2),
  subjectName: z.string().min(2),
  department: z.string().optional(),
  academicYear: z.string().optional(),
  semester: z.string().optional(),
  batch: z.string().min(1),
  studentGroup: z.string().optional(),
  classType: z.preprocess(
    value => {
      const normalized = String(value ?? "")
        .trim()
        .toLowerCase();
      if (
        ["practical", "practical lab", "lab", "laboratory"].includes(normalized)
      )
        return "Practical";
      if (["tutorial", "tutorials"].includes(normalized)) return "Tutorial";
      if (["theory", "theoretical", "lecture", "lectures"].includes(normalized))
        return "Theory";
      return value;
    },
    z.enum(["Theory", "Practical", "Tutorial"])
  ),
  participantCount: z.number().int().positive(),
  scheduleType: z.enum(["routine", "temporary"]),
  day: z.string(),
  sessionDate: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive(),
  repeatWeekly: z.boolean().default(true),
  roomId: z.number().int().positive().optional().nullable(),
  staffIds: z.array(z.number().int().positive()).default([]),
  requirements: z.string().optional(),
  status: z
    .enum(["scheduled", "cancelled", "rescheduled"])
    .default("scheduled"),
  notes: z.string().optional(),
  courseId: z.number().int().positive().optional().nullable(),
  program: z.enum(["IT", "AMC", "COMMON"]).optional().nullable(),
  level: z.number().int().min(1).max(4).optional().nullable(),
  id: z.number().int().positive().optional(),
});
type SessionInput = z.infer<typeof sessionInput>;
const looseRows = z.array(z.record(z.string(), z.any())).min(1).max(5000);

// ---------------------------------------------------------------------------
// Session enrichment for the UI
// ---------------------------------------------------------------------------
async function enrichedSessions(filter?: { semester?: number | null }) {
  const [rows, assignments, staffRows, courseRows] = await Promise.all([
    listSessions(),
    getAssignments(),
    listStaff(),
    listCourses(),
  ]);
  const staffById = new Map(staffRows.map(person => [person.id, person]));
  const courseById = new Map(courseRows.map(course => [course.id, course]));
  const courseByCode = new Map(courseRows.map(course => [course.code, course]));
  return rows
    .filter(row => {
      if (!filter?.semester) return true;
      const value = semesterNumber(row.session.semester);
      return !value || value === filter.semester;
    })
    .map(row => {
      const people = assignments
        .filter(a => a.sessionId === row.session.id)
        .map(a => staffById.get(a.staffId))
        .filter(Boolean)
        .map(person => ({
          id: person!.id,
          name: person!.name,
          staffCode: person!.staffCode,
          email: person!.email,
        }));
      const course =
        (row.session.courseId && courseById.get(row.session.courseId)) ||
        courseByCode.get(row.session.subjectCode) ||
        null;
      return {
        ...row.session,
        room: row.room
          ? {
              id: row.room.id,
              code: row.room.code,
              name: row.room.name,
              type: row.room.type,
              capacity: row.room.capacity,
            }
          : null,
        staff: people,
        staffIds: people.map(person => person.id),
        cohorts: sessionCohorts(row.session),
        category: course?.category || null,
        courseId: row.session.courseId || course?.id || null,
      };
    });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(o =>
      o.ctx.user ? publicUser(o.ctx.user) : null
    ),
    login: publicProcedure
      .input(localLoginInput)
      .mutation(async ({ input, ctx }) => {
        const identifier = input.email.trim().toLowerCase();
        let user = await getUserByEmail(identifier);
        if (!user && identifier.includes("@"))
          user = (await listUsers()).find(
            row => (row.email || "").trim().toLowerCase() === identifier
          );
        if (!user && !identifier.includes("@")) {
          // allow students to sign in with their registration number / student ID
          user = (await listUsers()).find(
            row =>
              (row.registrationNo || "").toLowerCase() === identifier ||
              (row.studentId || "").toLowerCase() === identifier
          );
        }
        if (!user && input.role === "lecturer" && identifier.includes("@")) {
          const lecturer = (await listStaff()).find(
            person =>
              person.email && person.email.trim().toLowerCase() === identifier
          );
          if (lecturer) {
            const db = await getDb();
            if (db) {
              const inserted = await db.insert(users).values({
                openId: identifier,
                name: lecturer.name,
                email: identifier,
                role: "lecturer",
                roleTitle: lecturer.role || "Lecturer",
                staffCode: lecturer.staffCode,
                phone: lecturer.telephone,
                qualifications: lecturer.qualification,
                mustChangePassword: 1,
                loginMethod: "local",
              });
              const newId = Number(
                (inserted as any)[0]?.insertId ?? (inserted as any).insertId
              );
              user =
                Number.isFinite(newId) && newId > 0
                  ? await getUserById(newId)
                  : await getUserByEmail(identifier);
            }
          }
        }
        if (user && input.role === "lecturer" && user.role !== "lecturer") {
          const lecturer = (await listStaff()).find(
            person =>
              person.email && person.email.trim().toLowerCase() === identifier
          );
          if (lecturer) {
            const db = await getDb();
            if (db)
              await db
                .update(users)
                .set({
                  role: "lecturer",
                  staffCode: lecturer.staffCode,
                  name: lecturer.name,
                })
                .where(eq(users.id, user.id));
            user = {
              ...user,
              role: "lecturer",
              staffCode: lecturer.staffCode,
              name: lecturer.name,
            };
          }
        }
        const normalizedEmail = user?.email?.toLowerCase() || identifier;
        const demo =
          firstRunAccounts[normalizedEmail as keyof typeof firstRunAccounts];
        if (demo && input.role !== demo.role)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: `Choose the ${demo.role} login option for this account.`,
          });
        if (user && !demo && user.role !== input.role)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: `This account is registered as a ${user.role}. Choose the matching login option.`,
          });
        if (
          demo?.role === "admin" &&
          input.password === demo.password &&
          user &&
          !user.passwordHash
        ) {
          const db = await getDb();
          if (db)
            await db
              .update(users)
              .set({
                passwordHash: hashPassword(demo.password),
                mustChangePassword: 0,
                role: "admin",
              })
              .where(eq(users.id, user.id));
          user = {
            ...user,
            passwordHash: hashPassword(demo.password),
            mustChangePassword: 0,
            role: "admin",
          };
        }
        if (!user && demo && input.password === demo.password) {
          const db = await getDb();
          if (db) {
            const inserted = await db.insert(users).values({
              openId: normalizedEmail,
              name: demo.name,
              email: normalizedEmail,
              passwordHash: hashPassword(demo.password),
              mustChangePassword: 0,
              role: demo.role,
              roleTitle: "Administrator",
              loginMethod: "local",
            });
            const newId = Number(
              (inserted as any)[0]?.insertId ?? (inserted as any).insertId
            );
            user =
              Number.isFinite(newId) && newId > 0
                ? await getUserById(newId)
                : await getUserByEmail(normalizedEmail);
          }
          if (
            !user &&
            ENV.localDemoMode &&
            normalizedEmail === LOCAL_DEMO_USER.email
          )
            user = LOCAL_DEMO_USER as any;
        }
        const valid =
          user &&
          (user.passwordHash
            ? verifyPassword(input.password || "", user.passwordHash)
            : !input.password && Boolean(user.mustChangePassword));
        if (!valid || !user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: user
              ? user.passwordHash
                ? "Incorrect password."
                : "First sign-in: leave the password empty to create your password."
              : "No account exists for this email. Ask the faculty administrator to create your account.",
          });
        const db = await getDb();
        if (db && user.role === "student" && user.registrationNo) {
          const academic = await academicSettings();
          const derived = deriveStudentCohort({
            registrationNo: user.registrationNo,
            email: user.email || undefined,
            program: user.program || undefined,
            currentAcademicYear: academic.academicYear,
          });
          const patch = {
            ...(derived.level ? { level: derived.level } : {}),
            ...(derived.program ? { program: derived.program } : {}),
          };
          if (Object.keys(patch).length) {
            await db.update(users).set(patch).where(eq(users.id, user.id));
            user = { ...user, ...patch };
          }
        }
        if (db)
          await db
            .update(users)
            .set({ lastSignedIn: new Date() })
            .where(eq(users.id, user.id))
            .catch(() => undefined);
        setSession(ctx.res, user);
        return publicUser(user);
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearSession(ctx.res, ctx.req);
      return { success: true } as const;
    }),
    changePassword: protectedProcedure
      .input(changePasswordInput)
      .mutation(async ({ input, ctx }) => {
        if (
          ctx.user.passwordHash &&
          !verifyPassword(input.currentPassword || "", ctx.user.passwordHash)
        )
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect.",
          });
        const db = await requireDb();
        await db
          .update(users)
          .set({
            passwordHash: hashPassword(input.newPassword),
            mustChangePassword: 0,
          })
          .where(eq(users.id, ctx.user.id));
        const message = "Your UOV timetable password was changed successfully.";
        await publishNotice({
          title: "Password changed",
          message,
          audience: ctx.user.role,
          recipientUserIds: [ctx.user.id],
        });
        if (ctx.user.email)
          await sendEmail({
            to: ctx.user.email,
            subject: "UOV timetable password changed",
            text: message,
          });
        return { success: true };
      }),
  }),

  // -------------------------------------------------------------------------
  staff: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const people = await listStaff();
      if (ctx.user.role !== "student") return people;
      const visible = new Set(
        (await enrichedSessions())
          .filter(s => studentCanSee(ctx.user, s))
          .flatMap(s => s.staffIds)
      );
      const courseRows = await listCourses();
      const cohort = userCohort(ctx.user);
      const myCourseIds = new Set(
        courseRows
          .filter(
            c => cohort && cohortsFor(c.program, c.level).includes(cohort)
          )
          .map(c => c.id)
      );
      for (const link of await listCourseLecturers())
        if (myCourseIds.has(link.courseId)) visible.add(link.staffId);
      return people
        .filter(person => visible.has(person.id))
        .map(person => ({
          ...person,
          maxDailyMinutes: 0,
          maxWeeklyMinutes: 0,
          availability: null,
        }));
    }),
    create: adminProcedure.input(staffInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const duplicate = (await listStaff()).find(
        p =>
          p.staffCode === input.staffCode ||
          (input.email && p.email?.toLowerCase() === input.email.toLowerCase())
      );
      if (duplicate)
        throw new TRPCError({
          code: "CONFLICT",
          message: `A lecturer with this staff ID or email already exists (${duplicate.name}).`,
        });
      const result = await db
        .insert(staff)
        .values({ ...input, email: input.email?.toLowerCase() || null });
      const id = Number((result as any)[0]?.insertId);
      await linkStaffToCourses(id, input.expertise);
      return id;
    }),
    update: adminProcedure
      .input(staffInput.extend({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const { id, ...values } = input;
        await db
          .update(staff)
          .set({ ...values, email: values.email?.toLowerCase() || null })
          .where(eq(staff.id, id));
        return id;
      }),
    bulkImport: adminProcedure
      .input(
        z.object({
          rows: looseRows,
          createAccounts: z.boolean().default(true),
          mapCourses: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const existing = await listStaff();
        const existingUsers = await listUsers();
        const semesterCells = [
          "1.1",
          "1.2",
          "2.1",
          "2.2",
          "3.1",
          "3.2",
          "4.1",
          "4.2",
        ];
        const report = {
          created: 0,
          updated: 0,
          accounts: 0,
          mappings: 0,
          skipped: [] as { row: number; name: string; reason: string }[],
        };
        const seen = new Set<string>();
        for (const [index, row] of input.rows.entries()) {
          const rowNo = index + 2;
          const email = pick(row, "email", "universityEmail").toLowerCase();
          const name = pick(row, "name", "fullName", "lecturerName");
          const staffCode =
            pick(row, "staffCode", "staffId", "lecturerId", "code") ||
            email.split("@")[0];
          if (!name) {
            report.skipped.push({
              row: rowNo,
              name: email || staffCode,
              reason: "Name is missing",
            });
            continue;
          }
          if (email && !email.endsWith("@vau.ac.lk")) {
            report.skipped.push({
              row: rowNo,
              name,
              reason: `Email must end with @vau.ac.lk (${email})`,
            });
            continue;
          }
          if (!staffCode) {
            report.skipped.push({
              row: rowNo,
              name,
              reason: "Staff code or email is required",
            });
            continue;
          }
          const key = staffCode.toLowerCase();
          if (seen.has(key) || (email && seen.has(email))) {
            report.skipped.push({
              row: rowNo,
              name,
              reason: "Duplicate row in the file",
            });
            continue;
          }
          seen.add(key);
          if (email) seen.add(email);
          const roleTitle =
            pick(row, "roleTitle", "designation", "role", "title") ||
            "Lecturer";
          const cells = semesterCells.map(
            cell => `${cell}: ${codesIn(pick(row, cell)).join(",")}`
          );
          const extra = codesIn(
            pick(
              row,
              "subjects",
              "courses",
              "subjectCodes",
              "semester1Subjects"
            ) +
              " " +
              pick(row, "semester2Subjects")
          );
          const expertise = [
            ...cells,
            ...(extra.length ? [`other: ${extra.join(",")}`] : []),
          ].join("; ");
          const values = {
            staffCode,
            name,
            role: roleTitle,
            department: pick(row, "department", "dept") || "Physical Science",
            email: email || null,
            telephone: pick(row, "phone", "telephone", "mobile") || null,
            qualification: pick(row, "qualification", "qualifications") || null,
            expertise,
            status: (/study\s*leave|on\s*leave|sabbatical/i.test(roleTitle) ||
            /leave/i.test(pick(row, "status"))
              ? "on-leave"
              : "active") as "active" | "on-leave",
          };
          const match = existing.find(
            p =>
              p.staffCode.toLowerCase() === key ||
              (email && (p.email || "").toLowerCase() === email)
          );
          let id: number;
          if (match) {
            await db.update(staff).set(values).where(eq(staff.id, match.id));
            id = match.id;
            report.updated++;
          } else {
            const result = await db.insert(staff).values(values);
            id = Number((result as any)[0]?.insertId);
            report.created++;
          }
          if (input.mapCourses)
            report.mappings += await linkStaffToCourses(id, expertise);
          if (input.createAccounts && email) {
            const existingUser = existingUsers.find(
              u => (u.email || "").trim().toLowerCase() === email
            );
            if (existingUser) {
              await db
                .update(users)
                .set({
                  name,
                  role: "lecturer",
                  roleTitle,
                  staffCode,
                  phone: values.telephone,
                  qualifications: values.qualification,
                  loginMethod: "local",
                  ...(existingUser.passwordHash
                    ? {}
                    : { mustChangePassword: 1 }),
                })
                .where(eq(users.id, existingUser.id));
            } else {
              await db.insert(users).values({
                openId: email,
                email,
                name,
                role: "lecturer",
                roleTitle,
                staffCode,
                phone: values.telephone,
                qualifications: values.qualification,
                mustChangePassword: 1,
                loginMethod: "local",
              });
              report.accounts++;
            }
          }
        }
        if (report.accounts)
          await publishNotice({
            title: "Lecturer accounts created",
            message: `${report.accounts} lecturer account(s) were created. Lecturers sign in with their @vau.ac.lk email and an empty password the first time, then create a private password.`,
            audience: "admin",
          });
        return report;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .delete(courseLecturers)
          .where(eq(courseLecturers.staffId, input.id));
        await db.delete(sessionStaff).where(eq(sessionStaff.staffId, input.id));
        await db.delete(staff).where(eq(staff.id, input.id));
        return input.id;
      }),
    deleteAll: adminProcedure.mutation(async () => {
      const db = await requireDb();
      await db.delete(courseLecturers);
      await db.delete(sessionStaff);
      await db.delete(staff);
      return true;
    }),
  }),

  // -------------------------------------------------------------------------
  users: router({
    list: adminProcedure.query(async () =>
      (await listUsers()).map(user => publicUser(user))
    ),
    create: adminProcedure.input(userInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const email = input.email.toLowerCase();
      if (await getUserByEmail(email))
        throw new TRPCError({
          code: "CONFLICT",
          message: `Email "${input.email}" is already in use.`,
        });
      const { password, openId: _openId, ...values } = input;
      const result = await db.insert(users).values({
        ...values,
        openId: email,
        email,
        passwordHash: password ? hashPassword(password) : null,
        mustChangePassword: 1,
        loginMethod: "local",
        batch:
          values.batch ||
          (values.level
            ? cohortLabel(values.program || "IT", values.level)
            : null),
      });
      const id = Number((result as any)[0]?.insertId);
      const message = password
        ? `Your UOV ${input.role} account was created. Sign in with your university email and the password supplied by the administrator, then change it.`
        : `Your UOV ${input.role} account was created. On your first sign-in, enter your university email and leave the password empty; the system will ask you to create a password.`;
      await publishNotice({
        title: "University account created",
        message,
        audience: input.role,
        recipientUserIds: [id],
      });
      await sendEmail({
        to: email,
        subject: "UOV timetable account created",
        text: message,
      });
      return id;
    }),
    update: adminProcedure
      .input(userInput.safeExtend({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const { id, password, openId: _openId, ...values } = input;
        const email = values.email.toLowerCase();
        const clash = (await listUsers()).find(
          u => u.id !== id && (u.email || "").toLowerCase() === email
        );
        if (clash)
          throw new TRPCError({
            code: "CONFLICT",
            message: `Email ${email} is already used by another account.`,
          });
        await db
          .update(users)
          .set({
            ...values,
            email,
            openId: email,
            ...(password
              ? { passwordHash: hashPassword(password), mustChangePassword: 1 }
              : {}),
          })
          .where(eq(users.id, id));
        if (password) {
          const message =
            "Your UOV account password was reset by an administrator. Sign in with the new password, then change it.";
          await publishNotice({
            title: "Password reset",
            message,
            audience: input.role,
            recipientUserIds: [id],
          });
          await sendEmail({
            to: email,
            subject: "UOV timetable password reset",
            text: message,
          });
        }
        return id;
      }),
    resetPassword: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .update(users)
          .set({ passwordHash: null, mustChangePassword: 1 })
          .where(eq(users.id, input.id));
        return input.id;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        if (input.id === ctx.user.id)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot delete your own account.",
          });
        const target = await getUserById(input.id);
        if (
          target?.role === "admin" &&
          (await listUsers()).filter(u => u.role === "admin").length <= 1
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The last administrator cannot be deleted.",
          });
        await db.delete(users).where(eq(users.id, input.id));
        return input.id;
      }),
    deleteAll: adminProcedure
      .input(
        z
          .object({ role: z.enum(["student", "lecturer"]).optional() })
          .optional()
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        if (input?.role)
          await db.delete(users).where(eq(users.role, input.role));
        else await db.delete(users).where(ne(users.role, "admin"));
        return true;
      }),
    /** Bulk student account creation with per-row validation. */
    bulkStudents: adminProcedure
      .input(
        z.object({
          rows: looseRows,
          defaultLevel: z.number().int().min(1).max(4).nullable().optional(),
          defaultProgram: z.enum(["IT", "AMC"]).nullable().optional(),
          updateExisting: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const academic = await academicSettings();
        const existing = await listUsers();
        const report = {
          created: 0,
          updated: 0,
          skipped: [] as { row: number; email: string; reason: string }[],
          createdIds: [] as number[],
        };
        const seen = new Set<string>();
        for (const [index, row] of input.rows.entries()) {
          const rowNo = index + 2;
          const email = pick(
            row,
            "email",
            "universityEmail",
            "studentEmail"
          ).toLowerCase();
          const name = pick(row, "name", "fullName", "studentName");
          if (!email) {
            report.skipped.push({
              row: rowNo,
              email: name || "—",
              reason: "Email is missing",
            });
            continue;
          }
          const problem = emailProblem("student", email);
          if (problem) {
            report.skipped.push({ row: rowNo, email, reason: problem });
            continue;
          }
          if (!name) {
            report.skipped.push({
              row: rowNo,
              email,
              reason: "Name is missing",
            });
            continue;
          }
          if (seen.has(email)) {
            report.skipped.push({
              row: rowNo,
              email,
              reason: "Duplicate email in the file",
            });
            continue;
          }
          seen.add(email);
          const registrationNo = pick(
            row,
            "registrationNo",
            "regNo",
            "registrationNumber",
            "indexNo"
          );
          const yearOfStudy = pick(
            row,
            "yearOfStudy",
            "academicYear",
            "batch",
            "year"
          );
          const derived = deriveStudentCohort({
            registrationNo,
            email,
            department: pick(row, "department", "dept", "degree"),
            program: pick(row, "program", "programme", "stream"),
            level: pick(row, "level", "currentLevel"),
            yearOfStudy,
            currentAcademicYear: academic.academicYear,
          });
          const program = derived.program || input.defaultProgram || null;
          const level = input.defaultLevel || derived.level || null;
          const values = {
            name,
            email,
            openId: email,
            role: "student" as const,
            roleTitle: "Student",
            studentId: pick(row, "studentId", "id", "studentNo") || null,
            registrationNo: registrationNo || null,
            academicYear: yearOfStudy || null,
            phone: pick(row, "phone", "mobile") || null,
            program,
            level,
            batch: level
              ? cohortLabel(program || "IT", level)
              : yearOfStudy || null,
          };
          const match = existing.find(
            u => (u.email || "").toLowerCase() === email
          );
          if (match) {
            if (match.role !== "student") {
              report.skipped.push({
                row: rowNo,
                email,
                reason: `Email already belongs to a ${match.role} account`,
              });
              continue;
            }
            if (!input.updateExisting) {
              report.skipped.push({
                row: rowNo,
                email,
                reason: "Account already exists",
              });
              continue;
            }
            await db.update(users).set(values).where(eq(users.id, match.id));
            report.updated++;
          } else {
            const result = await db.insert(users).values({
              ...values,
              mustChangePassword: 1,
              loginMethod: "local",
            });
            const id = Number((result as any)[0]?.insertId);
            report.createdIds.push(id);
            report.created++;
          }
        }
        if (report.createdIds.length) {
          const message =
            "Your UOV student timetable account is ready. Sign in with your university email and leave the password empty the first time — you will then create your own password.";
          await publishNotice({
            title: "Welcome to the UOV timetable",
            message,
            audience: "student",
            recipientUserIds: report.createdIds,
          });
          const created = (await listUsers()).filter(u =>
            report.createdIds.includes(u.id)
          );
          await emailUsers(created, "UOV timetable account created", message);
        }
        return {
          created: report.created,
          updated: report.updated,
          skipped: report.skipped,
        };
      }),
  }),

  // -------------------------------------------------------------------------
  rooms: router({
    list: protectedProcedure.query(async () => listRooms()),
    create: adminProcedure.input(roomInput).mutation(async ({ input }) => {
      const db = await requireDb();
      if (
        (await listRooms()).some(
          room => room.code.toLowerCase() === input.code.toLowerCase()
        )
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: `Room code ${input.code} already exists.`,
        });
      const result = await db.insert(rooms).values(input);
      return Number((result as any)[0]?.insertId);
    }),
    update: adminProcedure
      .input(roomInput.extend({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const { id, ...values } = input;
        await db.update(rooms).set(values).where(eq(rooms.id, id));
        return id;
      }),
    bulkImport: adminProcedure
      .input(z.object({ rows: looseRows }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const existing = await listRooms();
        const report = {
          created: 0,
          updated: 0,
          skipped: [] as { row: number; code: string; reason: string }[],
        };
        for (const [index, row] of input.rows.entries()) {
          const code = pick(row, "code", "roomCode", "hallCode").toUpperCase();
          const parsed = roomInput.safeParse({
            code,
            name: pick(row, "name", "roomName", "hallName") || code,
            type: pick(row, "type", "roomType") || "Lecture Hall",
            capacity: Number(pick(row, "capacity", "seats")),
            department: pick(row, "department") || undefined,
            building: pick(row, "building") || undefined,
            floor: pick(row, "floor") || undefined,
            equipment: pick(row, "equipment", "facilities") || undefined,
            accessibility: pick(row, "accessibility") || undefined,
            status: pick(row, "status") || "available",
            availabilityNotes:
              pick(row, "availabilityNotes", "notes") || undefined,
          });
          if (!parsed.success) {
            report.skipped.push({
              row: index + 2,
              code: code || "—",
              reason: parsed.error.issues
                .map(i => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
            });
            continue;
          }
          const match = existing.find(
            room => room.code.toLowerCase() === code.toLowerCase()
          );
          if (match) {
            await db
              .update(rooms)
              .set(parsed.data)
              .where(eq(rooms.id, match.id));
            report.updated++;
          } else {
            await db.insert(rooms).values(parsed.data);
            report.created++;
          }
        }
        return report;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .update(sessions)
          .set({ roomId: null })
          .where(eq(sessions.roomId, input.id));
        await db.delete(rooms).where(eq(rooms.id, input.id));
        return input.id;
      }),
    deleteAll: adminProcedure.mutation(async () => {
      const db = await requireDb();
      await db.update(sessions).set({ roomId: null });
      await db.delete(rooms);
      return true;
    }),
    /** Free rooms for a given day/time (lecture hall assignment helper). */
    available: protectedProcedure
      .input(
        z.object({
          day: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          semester: z.number().int().min(1).max(2).optional(),
          date: z.string().optional(),
          capacity: z.number().default(0),
          kind: z.enum(["any", "hall", "lab"]).default("any"),
          equipment: z.string().optional(),
          excludeSessionId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const [roomRows, sessionRows, exceptions] = await Promise.all([
          listRooms(),
          listSessions(),
          listSessionExceptions(),
        ]);
        return roomRows
          .filter(r => r.status === "available" && r.capacity >= input.capacity)
          .filter(r =>
            input.kind === "lab"
              ? roomSuitable(r, { classType: "Practical" })
              : input.kind === "hall"
                ? roomSuitable(r, { classType: "Theory" })
                : true
          )
          .filter(
            r =>
              !input.equipment ||
              (r.equipment || "")
                .toLowerCase()
                .includes(input.equipment.toLowerCase())
          )
          .map(r => {
            const clash = sessionRows.find(
              x =>
                x.session.id !== input.excludeSessionId &&
                x.session.status !== "cancelled" &&
                (!input.semester ||
                  !semesterNumber(x.session.semester) ||
                  semesterNumber(x.session.semester) === input.semester) &&
                !(
                  input.date &&
                  x.session.scheduleType === "routine" &&
                  exceptions.some(
                    e =>
                      e.sessionId === x.session.id &&
                      e.occurrenceDate === input.date &&
                      e.status === "cancelled"
                  )
                ) &&
                x.session.day === input.day &&
                x.session.roomId === r.id &&
                intervalsOverlap(
                  input.startTime,
                  input.endTime,
                  x.session.startTime,
                  x.session.endTime
                )
            );
            return {
              ...r,
              free: !clash,
              busyWith: clash
                ? `${clash.session.subjectCode} ${clash.session.startTime}–${clash.session.endTime}`
                : null,
              spare: r.capacity - input.capacity,
            };
          })
          .sort((a, b) => Number(b.free) - Number(a.free) || a.spare - b.spare);
      }),
  }),

  // -------------------------------------------------------------------------
  courses: router({
    list: protectedProcedure.query(async () => {
      const [courseRows, links, staffRows, sessionRows] = await Promise.all([
        listCourses(),
        listCourseLecturers(),
        listStaff(),
        listSessions(),
      ]);
      const staffById = new Map(staffRows.map(p => [p.id, p]));
      return courseRows
        .map(course => ({
          ...course,
          learningOutcomes: parseList(course.learningOutcomes),
          readings: parseList(course.readings),
          cohort: cohortLabel(course.program, course.level),
          lecturers: links
            .filter(link => link.courseId === course.id)
            .map(link => ({
              ...link,
              name: staffById.get(link.staffId)?.name || "Unknown",
              staffCode: staffById.get(link.staffId)?.staffCode || "",
              status: staffById.get(link.staffId)?.status || "active",
            })),
          scheduledSessions: sessionRows.filter(
            r =>
              r.session.status !== "cancelled" &&
              (r.session.courseId === course.id ||
                (!r.session.courseId && r.session.subjectCode === course.code))
          ).length,
        }))
        .sort(
          (a, b) =>
            a.level - b.level ||
            a.semester - b.semester ||
            a.program.localeCompare(b.program) ||
            a.code.localeCompare(b.code)
        );
    }),
    detail: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const courseRows = await listCourses();
        const course = courseRows.find(c => c.id === input.id);
        if (!course)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Course not found",
          });
        const [links, staffRows] = await Promise.all([
          listCourseLecturers(),
          listStaff(),
        ]);
        const all = await enrichedSessions();
        const courseSessions = all
          .filter(
            s => s.courseId === course.id || s.subjectCode === course.code
          )
          .filter(
            s => ctx.user.role !== "student" || studentCanSee(ctx.user, s)
          );
        const prerequisiteCodes = codesIn(course.prerequisites);
        return {
          ...course,
          learningOutcomes: parseList(course.learningOutcomes),
          readings: parseList(course.readings),
          cohort: cohortLabel(course.program, course.level),
          programName: programLabel[course.program] || course.program,
          lecturers: links
            .filter(link => link.courseId === course.id)
            .map(link => {
              const person = staffRows.find(p => p.id === link.staffId);
              return {
                staffId: link.staffId,
                role: link.role,
                component: link.component,
                name: person?.name || "Unknown",
                title: person?.role || "",
                email: person?.email || "",
                telephone: person?.telephone || "",
                qualification: person?.qualification || "",
                department: person?.department || "",
              };
            }),
          prerequisiteCourses: prerequisiteCodes.map(code => {
            const match = courseRows.find(c => c.code === code);
            return {
              code,
              name: match?.name || handbookEntries[code]?.title || "",
              id: match?.id || null,
            };
          }),
          requiredBy: courseRows
            .filter(c => codesIn(c.prerequisites).includes(course.code))
            .map(c => ({ id: c.id, code: c.code, name: c.name })),
          sessions: courseSessions.sort(
            (a, b) =>
              ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].indexOf(
                a.day
              ) -
                [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                ].indexOf(b.day) || minutes(a.startTime) - minutes(b.startTime)
          ),
          inHandbook: Boolean(handbookEntries[course.code]),
        };
      }),
    /** Courses relevant to the signed-in user (student cohort / lecturer assignments). */
    mine: protectedProcedure.query(async ({ ctx }) => {
      const [courseRows, links] = await Promise.all([
        listCourses(),
        listCourseLecturers(),
      ]);
      if (ctx.user.role === "student") {
        const cohort = userCohort(ctx.user);
        return courseRows
          .filter(
            c =>
              c.active !== 0 &&
              cohort &&
              cohortsFor(c.program, c.level).includes(cohort)
          )
          .map(c => ({
            ...c,
            learningOutcomes: parseList(c.learningOutcomes),
          }));
      }
      if (ctx.user.role === "lecturer") {
        const me = await staffForUser(ctx.user);
        const ids = new Set(
          links.filter(l => me && l.staffId === me.id).map(l => l.courseId)
        );
        return courseRows
          .filter(c => ids.has(c.id))
          .map(c => ({
            ...c,
            learningOutcomes: parseList(c.learningOutcomes),
          }));
      }
      return courseRows.map(c => ({
        ...c,
        learningOutcomes: parseList(c.learningOutcomes),
      }));
    }),
    create: adminProcedure.input(courseInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const code = input.code.trim().toUpperCase();
      if ((await listCourses()).some(c => c.code === code))
        throw new TRPCError({
          code: "CONFLICT",
          message: `Course ${code} is already declared.`,
        });
      const result = await db
        .insert(courses)
        .values(courseValues({ ...input, code }));
      return Number((result as any)[0]?.insertId);
    }),
    update: adminProcedure
      .input(courseInput.extend({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const { id, ...rest } = input;
        const code = rest.code.trim().toUpperCase();
        if ((await listCourses()).some(c => c.code === code && c.id !== id))
          throw new TRPCError({
            code: "CONFLICT",
            message: `Course ${code} already exists.`,
          });
        await db
          .update(courses)
          .set(courseValues({ ...rest, code }))
          .where(eq(courses.id, id));
        await db
          .update(sessions)
          .set({ subjectCode: code, subjectName: rest.name })
          .where(eq(sessions.courseId, id));
        return id;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .delete(courseLecturers)
          .where(eq(courseLecturers.courseId, input.id));
        await db.delete(courses).where(eq(courses.id, input.id));
        return input.id;
      }),
    deleteAll: adminProcedure.mutation(async () => {
      const db = await requireDb();
      await db.delete(courseLecturers);
      await db.delete(courses);
      return true;
    }),
    /** Course declaring from CSV: upsert + handbook enrichment + lecturer auto-mapping. */
    bulkImport: adminProcedure
      .input(
        z.object({
          rows: looseRows,
          useHandbook: z.boolean().default(true),
          autoAssignLecturers: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const existing = await listCourses();
        const staffRows = await listStaff();
        const report = {
          created: 0,
          updated: 0,
          enriched: 0,
          lecturerLinks: 0,
          merged: [] as string[],
          skipped: [] as { row: number; code: string; reason: string }[],
        };
        const merged = new Map<
          string,
          {
            course: ReturnType<typeof normalizeCourseRow> & {};
            raw: Record<string, any>;
          }
        >();
        for (const [index, row] of input.rows.entries()) {
          const course = normalizeCourseRow(row);
          if (!course) {
            report.skipped.push({
              row: index + 2,
              code: pick(row, "subjectCode", "code") || "—",
              reason:
                "A valid course code (e.g. IT1113) and course name are required",
            });
            continue;
          }
          const previous = merged.get(course.code);
          if (previous) {
            if (previous.course.program !== course.program) {
              previous.course.program = "COMMON";
              report.merged.push(course.code);
            }
            continue;
          }
          merged.set(course.code, { course, raw: row });
        }
        for (const { course, raw } of Array.from(merged.values())) {
          const match = existing.find(c => c.code === course.code);
          const detailFromFile = {
            description:
              pick(raw, "description", "courseDescription") || undefined,
            objective: pick(raw, "objective", "objectives") || undefined,
            learningOutcomes: pick(raw, "learningOutcomes", "ilos", "outcomes")
              ? toJsonList(pick(raw, "learningOutcomes", "ilos", "outcomes"))
              : undefined,
            prerequisites:
              pick(raw, "prerequisites", "prerequisite") || undefined,
            expectedStudents:
              Number(
                pick(raw, "expectedStudents", "students", "participantCount")
              ) || undefined,
          };
          const book = input.useHandbook ? handbookDetails(course.code) : null;
          const values: any = {
            ...course,
            ...Object.fromEntries(
              Object.entries(detailFromFile).filter(([, v]) => v !== undefined)
            ),
          };
          if (book) {
            for (const [key, value] of Object.entries(book))
              if (value && !values[key] && !(match as any)?.[key])
                values[key] = value;
            report.enriched++;
          }
          let id: number;
          if (match) {
            await db
              .update(courses)
              .set(values)
              .where(eq(courses.id, match.id));
            id = match.id;
            report.updated++;
          } else {
            const result = await db.insert(courses).values(values);
            id = Number((result as any)[0]?.insertId);
            report.created++;
          }
          const explicit = pick(
            raw,
            "lecturers",
            "lecturer",
            "lecturerCodes",
            "staffCodes",
            "lecturerEmails"
          );
          if (explicit) {
            for (const token of explicit
              .split(/[;|,]/)
              .map(t => t.trim().toLowerCase())
              .filter(Boolean)) {
              const person = staffRows.find(
                p =>
                  p.staffCode.toLowerCase() === token ||
                  (p.email || "").toLowerCase() === token ||
                  p.name.toLowerCase() === token
              );
              if (person) {
                await db
                  .insert(courseLecturers)
                  .values({ courseId: id, staffId: person.id })
                  .onDuplicateKeyUpdate({ set: { staffId: person.id } });
                report.lecturerLinks++;
              }
            }
          }
        }
        if (input.autoAssignLecturers)
          report.lecturerLinks += await autoAssignLecturers(false);
        return report;
      }),
    setLecturers: adminProcedure
      .input(
        z.object({
          courseId: z.number().int().positive(),
          lecturers: z.array(
            z.object({
              staffId: z.number().int().positive(),
              role: z
                .enum(["coordinator", "lecturer", "instructor"])
                .default("lecturer"),
              component: z
                .enum(["both", "theory", "practical"])
                .default("both"),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .delete(courseLecturers)
          .where(eq(courseLecturers.courseId, input.courseId));
        if (input.lecturers.length)
          await db
            .insert(courseLecturers)
            .values(
              input.lecturers.map(l => ({ ...l, courseId: input.courseId }))
            );
        return input.courseId;
      }),
    setRooms: adminProcedure
      .input(
        z.object({
          courseId: z.number().int().positive(),
          preferredRoomId: z.number().int().positive().nullable(),
          practicalRoomId: z.number().int().positive().nullable(),
          expectedStudents: z.number().int().min(0).nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .update(courses)
          .set({
            preferredRoomId: input.preferredRoomId,
            practicalRoomId: input.practicalRoomId,
            ...(input.expectedStudents !== undefined
              ? { expectedStudents: input.expectedStudents || null }
              : {}),
          })
          .where(eq(courses.id, input.courseId));
        return input.courseId;
      }),
    /** Re-read all lecturer teaching profiles and link them to declared courses. */
    autoAssignLecturers: adminProcedure
      .input(z.object({ onlyUnassigned: z.boolean().default(true) }).optional())
      .mutation(async ({ input }) => ({
        links: await autoAssignLecturers(!(input?.onlyUnassigned ?? true)),
      })),
    applyHandbook: adminProcedure
      .input(z.object({ overwrite: z.boolean().default(false) }).optional())
      .mutation(async ({ input }) => {
        const db = await requireDb();
        let updated = 0;
        for (const course of await listCourses()) {
          const book = handbookDetails(course.code);
          if (!book) continue;
          const patch: any = {};
          for (const [key, value] of Object.entries(book))
            if (value && (input?.overwrite || !(course as any)[key]))
              patch[key] = value;
          if (Object.keys(patch).length) {
            await db
              .update(courses)
              .set(patch)
              .where(eq(courses.id, course.id));
            updated++;
          }
        }
        return { updated, available: Object.keys(handbookEntries).length };
      }),
    handbookLookup: adminProcedure
      .input(z.object({ code: z.string() }))
      .query(
        ({ input }) => handbookEntries[input.code.trim().toUpperCase()] || null
      ),
  }),

  // -------------------------------------------------------------------------
  settings: router({
    content: publicProcedure.query(async () =>
      contentInput.parse((await settingJson<any>("content", {})) || {})
    ),
    updateContent: adminProcedure
      .input(contentInput)
      .mutation(async ({ input }) => {
        await saveSetting("content", input);
        return input;
      }),
    notifications: adminProcedure.query(async () =>
      notificationInput.parse(
        (await settingJson<any>("notifications", {})) || {}
      )
    ),
    updateNotifications: adminProcedure
      .input(notificationInput)
      .mutation(async ({ input }) => {
        await saveSetting("notifications", input);
        return input;
      }),
    constraints: protectedProcedure.query(async () => currentPolicy()),
    updateConstraints: adminProcedure
      .input(constraintPolicySchema)
      .mutation(async ({ input }) => {
        await saveSetting("constraintPolicy", input);
        return parseConstraintPolicy(JSON.stringify(input));
      }),
    academic: protectedProcedure.query(async () => academicSettings()),
    updateAcademic: adminProcedure
      .input(academicInput)
      .mutation(async ({ input }) => {
        await saveSetting("academic", input);
        return input;
      }),
    periods: protectedProcedure.query(async () => {
      const policy = await currentPolicy();
      return {
        periods: getCandidateSlots("Theory", policy).map(([start, end]) => ({
          start,
          end,
        })),
        practicalSlots: policy.practicalSlots,
        breaks: policy.breaks,
      };
    }),
  }),

  // -------------------------------------------------------------------------
  timetable: router({
    /** Automatic semester timetable generation for every level and programme. */
    generate: adminProcedure
      .input(
        z.object({
          semester: z.number().int().min(1).max(2),
          replace: z
            .enum(["all-routine", "generated-only", "none"])
            .default("all-routine"),
          levels: z
            .array(z.number().int().min(1).max(4))
            .min(1)
            .default([1, 2, 3, 4]),
          programs: z
            .array(z.enum(["IT", "AMC"]))
            .min(1)
            .default(["IT", "AMC"]),
          defaultCohortSize: z.number().int().min(1).max(1000).optional(),
          notify: z.boolean().default(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const academic = await academicSettings();
        const policy = await currentPolicy();
        const courseRows = (await listCourses()).filter(
          c =>
            c.active !== 0 &&
            c.semester === input.semester &&
            input.levels.includes(c.level) &&
            (c.program === "COMMON" ||
              input.programs.includes(c.program as "IT" | "AMC"))
        );
        if (!courseRows.length)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No active courses are declared for Semester ${input.semester} in the selected levels. Import or declare courses first.`,
          });
        const inScope = (row: {
          semester?: string | null;
          level?: number | null;
          batch?: string | null;
          program?: string | null;
        }) => {
          const sem = semesterNumber(row.semester);
          if (sem && sem !== input.semester) return false;
          const level = row.level || levelNumber(row.batch);
          if (level && !input.levels.includes(level)) return false;
          const program = row.program || normalizeProgram(row.batch);
          if (
            program &&
            program !== "COMMON" &&
            !input.programs.includes(program as any)
          )
            return false;
          return true;
        };
        // 1) clear previous routine sessions in scope
        let removed = 0;
        if (input.replace !== "none") {
          const current = await listSessions();
          const toDelete = current
            .filter(
              r => r.session.scheduleType === "routine" && inScope(r.session)
            )
            .filter(
              r => input.replace === "all-routine" || r.session.generationRunId
            )
            .map(r => r.session.id);
          for (let i = 0; i < toDelete.length; i += 500) {
            const chunk = toDelete.slice(i, i + 500);
            await db
              .delete(sessionStaff)
              .where(inArray(sessionStaff.sessionId, chunk));
            await db
              .delete(sessionExceptions)
              .where(inArray(sessionExceptions.sessionId, chunk));
            await db.delete(sessions).where(inArray(sessions.id, chunk));
          }
          removed = toDelete.length;
        }
        // 2) fixed sessions that must be respected (same semester, not cancelled)
        const [remaining, assignments, links, staffRows, roomRows, userRows] =
          await Promise.all([
            listSessions(),
            getAssignments(),
            listCourseLecturers(),
            listStaff(),
            listRooms(),
            listUsers(),
          ]);
        const fixed: FixedSession[] = remaining
          .filter(
            r =>
              r.session.status !== "cancelled" &&
              r.session.scheduleType === "routine"
          )
          .filter(
            r =>
              !semesterNumber(r.session.semester) ||
              semesterNumber(r.session.semester) === input.semester
          )
          .map(r => ({
            id: r.session.id,
            day: r.session.day,
            startTime: r.session.startTime,
            endTime: r.session.endTime,
            roomId: r.session.roomId,
            staffIds: assignments
              .filter(a => a.sessionId === r.session.id)
              .map(a => a.staffId),
            cohorts: sessionCohorts(r.session),
            elective: /^EL/i.test(r.session.subjectCode),
            courseCode: r.session.subjectCode,
            classType: r.session.classType,
          }));
        // 3) cohort sizes from student accounts
        const cohortSizes: Record<string, number> = {};
        for (const user of userRows) {
          if (user.role !== "student") continue;
          const cohort = userCohort(user);
          if (cohort) cohortSizes[cohort] = (cohortSizes[cohort] || 0) + 1;
        }
        const schedCourses: SchedCourse[] = courseRows.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          program: c.program,
          level: c.level,
          semester: c.semester,
          category: c.category,
          theoryHours: c.theoryHours,
          practicalHours: c.practicalHours,
          expectedStudents: c.expectedStudents,
          preferredRoomId: c.preferredRoomId,
          practicalRoomId: c.practicalRoomId,
          lecturers: links
            .filter(l => l.courseId === c.id)
            .map(l => ({
              staffId: l.staffId,
              component: l.component,
              role: l.role,
            })),
        }));
        const result = generateTimetable(schedCourses, staffRows, roomRows, {
          policy,
          cohortSizes,
          defaultCohortSize:
            input.defaultCohortSize || academic.defaultCohortSize,
          maxParallelElectives: academic.maxParallelElectives,
          fixedSessions: fixed,
        });
        // 4) persist run + sessions
        const runInsert = await db.insert(generationRuns).values({
          semester: input.semester,
          academicYear: academic.academicYear,
          createdBy: ctx.user.id,
          scheduled: result.placements.length,
          unscheduled: result.unscheduled.length,
          report: JSON.stringify({
            ...result,
            placements: undefined,
            scope: input,
            removed,
          }),
        });
        const runId = Number((runInsert as any)[0]?.insertId);
        const values = result.placements.map(p => ({
          subjectCode: p.code,
          subjectName: p.name,
          department: programLabel[p.program] || p.program,
          academicYear: academic.academicYear,
          semester: `Semester ${input.semester}`,
          batch: cohortLabel(p.program, p.level),
          studentGroup: p.category === "elective" ? "Elective" : null,
          classType: p.classType,
          participantCount: p.participants,
          scheduleType: "routine" as const,
          day: p.day,
          sessionDate: null,
          startTime: p.startTime,
          endTime: p.endTime,
          durationMinutes: minutes(p.endTime) - minutes(p.startTime),
          repeatWeekly: 1,
          roomId: p.roomId,
          requirements: p.classType === "Practical" ? "Laboratory" : null,
          status: "scheduled" as const,
          notes: p.notes.length ? p.notes.join(" · ") : null,
          courseId: p.courseId,
          program: p.program,
          level: p.level,
          generationRunId: runId,
        }));
        for (let i = 0; i < values.length; i += 200) {
          const chunk = values.slice(i, i + 200);
          const ids = await db.insert(sessions).values(chunk).$returningId();
          const staffValues = chunk.flatMap((_, j) =>
            result.placements[i + j].staffIds.map(staffId => ({
              sessionId: Number(ids[j].id),
              staffId,
            }))
          );
          if (staffValues.length)
            await db.insert(sessionStaff).values(staffValues);
        }
        if (input.notify && result.placements.length)
          await publishNotice({
            title: `Semester ${input.semester} timetable published`,
            message: `The ${academic.academicYear} Semester ${input.semester} timetable has been generated (${result.placements.length} weekly sessions). Open “My timetable” to see your classes.`,
            audience: "all",
            authorId: ctx.user.id,
          });
        return { runId, removed, ...result };
      }),
    runs: adminProcedure.query(async () =>
      (await listGenerationRuns())
        .sort((a, b) => b.id - a.id)
        .slice(0, 20)
        .map(run => {
          let report: any = null;
          try {
            report = run.report ? JSON.parse(run.report) : null;
          } catch {
            report = null;
          }
          return {
            id: run.id,
            semester: run.semester,
            academicYear: run.academicYear,
            createdAt: run.createdAt,
            scheduled: run.scheduled,
            unscheduled: run.unscheduled,
            stats: report?.stats || null,
            warnings: report?.warnings || [],
            unscheduledList: report?.unscheduled || [],
            removed: report?.removed || 0,
          };
        })
    ),
    /** Pre-flight readiness check shown before generation. */
    readiness: adminProcedure
      .input(z.object({ semester: z.number().int().min(1).max(2) }))
      .query(async ({ input }) => {
        const [courseRows, links, staffRows, roomRows, userRows] =
          await Promise.all([
            listCourses(),
            listCourseLecturers(),
            listStaff(),
            listRooms(),
            listUsers(),
          ]);
        const semCourses = courseRows.filter(
          c => c.semester === input.semester && c.active !== 0
        );
        const teachable = semCourses.filter(
          c => c.theoryHours + c.practicalHours > 0
        );
        const active = new Set(
          staffRows.filter(s => s.status === "active").map(s => s.id)
        );
        const noLecturer = teachable.filter(
          c => !links.some(l => l.courseId === c.id && active.has(l.staffId))
        );
        const policy = await currentPolicy();
        const periodsPerWeek = getCandidateSlots("Theory", policy).length * 5;
        const cohorts = ["IT", "AMC"].flatMap(program =>
          [1, 2, 3, 4].map(level => {
            const key = `${program}-L${level}`;
            const list = teachable.filter(c =>
              cohortsFor(c.program, c.level).includes(key)
            );
            const core = list.filter(c => c.category === "core");
            const electives = list.filter(c => c.category !== "core");
            const hours = (items: typeof list) =>
              items.reduce(
                (sum, c) =>
                  sum + c.theoryHours + Math.ceil(c.practicalHours / 2) * 2,
                0
              );
            return {
              cohort: key,
              label: cohortLabel(program, level),
              courses: list.length,
              hours: hours(list),
              coreHours: hours(core),
              electiveHours: hours(electives),
              students: userRows.filter(
                u => u.role === "student" && userCohort(u) === key
              ).length,
            };
          })
        );
        return {
          courses: semCourses.length,
          teachable: teachable.length,
          zeroHour: semCourses
            .filter(c => c.theoryHours + c.practicalHours === 0)
            .map(c => ({ code: c.code, name: c.name })),
          noLecturer: noLecturer.map(c => ({
            id: c.id,
            code: c.code,
            name: c.name,
            cohort: cohortLabel(c.program, c.level),
          })),
          lecturers: staffRows.filter(s => s.status === "active").length,
          halls: roomRows.filter(
            r =>
              r.status === "available" &&
              !roomSuitable(r, { classType: "Practical" })
          ).length,
          labs: roomRows.filter(
            r =>
              r.status === "available" &&
              roomSuitable(r, { classType: "Practical" })
          ).length,
          periodsPerWeek,
          cohorts,
        };
      }),
  }),

  // -------------------------------------------------------------------------
  sessions: router({
    list: protectedProcedure
      .input(
        z
          .object({
            semester: z.number().int().min(1).max(2).nullable().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const rows = await enrichedSessions({
          semester: input?.semester ?? null,
        });
        return ctx.user.role === "student"
          ? rows.filter(row => studentCanSee(ctx.user, row))
          : rows;
      }),
    mine: protectedProcedure
      .input(
        z
          .object({
            semester: z.number().int().min(1).max(2).nullable().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const rows = await enrichedSessions({
          semester: input?.semester ?? null,
        });
        if (ctx.user.role === "student")
          return rows.filter(row => studentCanSee(ctx.user, row));
        if (ctx.user.role === "lecturer") {
          const me = await staffForUser(ctx.user);
          return me ? rows.filter(row => row.staffIds.includes(me.id)) : [];
        }
        return rows;
      }),
    myStaffProfile: protectedProcedure.query(async ({ ctx }) =>
      staffForUser(ctx.user)
    ),
    assignments: protectedProcedure.query(async () => getAssignments()),
    exceptions: protectedProcedure.query(() => listSessionExceptions()),
    conflicts: protectedProcedure
      .input(sessionInput)
      .query(({ input }) => findConflicts(input)),
    create: schedulerProcedure
      .input(sessionInput)
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "lecturer") {
          const me = await staffForUser(ctx.user);
          if (!me || !input.staffIds.includes(me.id))
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Lecturers can only add sessions that they teach themselves.",
            });
        }
        const issues = await findConflicts(input);
        if (issues.length) {
          await notifyConfigured(
            "rejection",
            "Timetable save rejected",
            issues.join(" • ")
          );
          throw new TRPCError({
            code: "CONFLICT",
            message: issues.join(" • "),
          });
        }
        const db = await requireDb();
        const { staffIds, id: _id, ...values } = input;
        const result = await db.insert(sessions).values({
          ...sessionValues(values),
          repeatWeekly: values.repeatWeekly ? 1 : 0,
        });
        const insertId = Number((result as any)[0]?.insertId);
        if (insertId && staffIds.length)
          await db
            .insert(sessionStaff)
            .values(
              staffIds.map(staffId => ({ sessionId: insertId, staffId }))
            );
        return insertId;
      }),
    update: schedulerProcedure
      .input(sessionInput.extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        const issues = await findConflicts(input);
        if (issues.length) {
          await notifyConfigured(
            "rejection",
            "Timetable change rejected",
            issues.join(" • ")
          );
          throw new TRPCError({
            code: "CONFLICT",
            message: issues.join(" • "),
          });
        }
        const db = await requireDb();
        const { staffIds, id, ...values } = input;
        await db
          .update(sessions)
          .set({
            ...sessionValues(values),
            repeatWeekly: values.repeatWeekly ? 1 : 0,
          })
          .where(eq(sessions.id, id));
        await db.delete(sessionStaff).where(eq(sessionStaff.sessionId, id));
        if (staffIds.length)
          await db
            .insert(sessionStaff)
            .values(staffIds.map(staffId => ({ sessionId: id, staffId })));
        return id;
      }),
    /** Lecture hall re-assignment for one session. */
    assignRoom: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          roomId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const source = await findSession(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        if (input.roomId) {
          const issues = (
            await findConflicts({
              ...source,
              staffIds: [],
              roomId: input.roomId,
              id: input.id,
            } as any)
          ).filter(issue => /room|seats|maintenance|suitab/i.test(issue));
          if (issues.length)
            throw new TRPCError({
              code: "CONFLICT",
              message: issues.join(" • "),
            });
        }
        await db
          .update(sessions)
          .set({ roomId: input.roomId })
          .where(eq(sessions.id, input.id));
        return input.id;
      }),
    /** Lecturer re-assignment for one session. */
    assignStaff: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          staffIds: z.array(z.number().int().positive()),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const source = await findSession(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        const issues = (
          await findConflicts({
            ...source,
            staffIds: input.staffIds,
            roomId: null,
            id: input.id,
          } as any)
        ).filter(issue => /staff|leave/i.test(issue));
        if (issues.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: issues.join(" • "),
          });
        await db
          .delete(sessionStaff)
          .where(eq(sessionStaff.sessionId, input.id));
        if (input.staffIds.length)
          await db
            .insert(sessionStaff)
            .values(
              input.staffIds.map(staffId => ({ sessionId: input.id, staffId }))
            );
        return input.id;
      }),
    duplicate: schedulerProcedure
      .input(
        z.object({
          id: z.number(),
          day: z.string(),
          startTime: z.string(),
          endTime: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        const db = await requireDb();
        const source = await findSession(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        const staffIds = (await getAssignments())
          .filter(a => a.sessionId === input.id)
          .map(a => a.staffId);
        const candidate = {
          ...source,
          day: input.day,
          startTime: input.startTime,
          endTime: input.endTime,
          staffIds,
          id: undefined,
        };
        const issues = await findConflicts(candidate as any);
        if (issues.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: issues.join(" • "),
          });
        const { id: _id, updatedAt: _u, ...rest } = source;
        const result = await db.insert(sessions).values({
          ...rest,
          day: input.day,
          startTime: input.startTime,
          endTime: input.endTime,
          durationMinutes: minutes(input.endTime) - minutes(input.startTime),
          status: "scheduled",
          generationRunId: null,
        });
        const insertId = Number((result as any)[0]?.insertId);
        if (staffIds.length)
          await db
            .insert(sessionStaff)
            .values(
              staffIds.map(staffId => ({ sessionId: insertId, staffId }))
            );
        return insertId;
      }),
    reschedule: schedulerProcedure
      .input(
        z.object({
          id: z.number(),
          day: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          roomId: z.number().int().positive().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        return applyReschedule(input);
      }),
    convertSchedule: schedulerProcedure
      .input(
        z.object({
          id: z.number(),
          scheduleType: z.enum(["routine", "temporary"]),
          sessionDate: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        const db = await requireDb();
        await db
          .update(sessions)
          .set({
            scheduleType: input.scheduleType,
            sessionDate: input.sessionDate || null,
            repeatWeekly: input.scheduleType === "routine" ? 1 : 0,
            status: "rescheduled",
          })
          .where(eq(sessions.id, input.id));
        return input.id;
      }),
    cancel: schedulerProcedure
      .input(
        z.object({
          id: z.number(),
          scope: z.enum(["one", "all"]).default("all"),
          occurrenceDate: z.string().optional(),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        const db = await requireDb();
        const source = await findSession(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        if (input.scope === "one" && source.scheduleType === "routine") {
          if (!input.occurrenceDate)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose the date of the occurrence to cancel.",
            });
          await db
            .insert(sessionExceptions)
            .values({
              sessionId: input.id,
              occurrenceDate: input.occurrenceDate,
              status: "cancelled",
              reason: input.reason || null,
            })
            .onDuplicateKeyUpdate({
              set: { status: "cancelled", reason: input.reason || null },
            });
        } else {
          await db
            .update(sessions)
            .set({ status: "cancelled" })
            .where(eq(sessions.id, input.id));
        }
        const message =
          input.scope === "one"
            ? `${source.subjectCode} – ${source.subjectName} on ${input.occurrenceDate} is cancelled.${input.reason ? ` Reason: ${input.reason}` : ""}`
            : `${source.subjectCode} – ${source.subjectName} (${source.day} ${source.startTime}) is cancelled.${input.reason ? ` Reason: ${input.reason}` : ""}`;
        await notifyConfigured("cancellation", "Session cancelled", message);
        await notifySessionAudience(source, "Session cancelled", message);
        return input.id;
      }),
    restore: schedulerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertCanEditSession(ctx.user, input.id);
        const db = await requireDb();
        const source = await findSession(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        const staffIds = (await getAssignments())
          .filter(a => a.sessionId === input.id)
          .map(a => a.staffId);
        const issues = await findConflicts({
          ...source,
          staffIds,
          id: input.id,
        } as any);
        if (issues.length)
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot restore: ${issues.join(" • ")}`,
          });
        await db
          .update(sessions)
          .set({ status: "scheduled" })
          .where(eq(sessions.id, input.id));
        return input.id;
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db
          .delete(sessionStaff)
          .where(eq(sessionStaff.sessionId, input.id));
        await db
          .delete(sessionExceptions)
          .where(eq(sessionExceptions.sessionId, input.id));
        await db.delete(sessions).where(eq(sessions.id, input.id));
        return input.id;
      }),
    clearSemester: adminProcedure
      .input(z.object({ semester: z.number().int().min(1).max(2) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const ids = (await listSessions())
          .filter(r => semesterNumber(r.session.semester) === input.semester)
          .map(r => r.session.id);
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          await db
            .delete(sessionStaff)
            .where(inArray(sessionStaff.sessionId, chunk));
          await db
            .delete(sessionExceptions)
            .where(inArray(sessionExceptions.sessionId, chunk));
          await db.delete(sessions).where(inArray(sessions.id, chunk));
        }
        return { removed: ids.length };
      }),
    /** Free time finder for a cohort / lecturer / room on a given day. */
    freeSlots: protectedProcedure
      .input(
        z.object({
          semester: z.number().int().min(1).max(2),
          cohort: z.string().optional(),
          staffId: z.number().optional(),
          roomId: z.number().optional(),
        })
      )
      .query(async ({ input }) => {
        const policy = await currentPolicy();
        const periods = getCandidateSlots("Theory", policy);
        const rows = (
          await enrichedSessions({ semester: input.semester })
        ).filter(s => s.status !== "cancelled");
        const relevant = rows.filter(
          s =>
            (input.cohort && s.cohorts.includes(input.cohort)) ||
            (input.staffId && s.staffIds.includes(input.staffId)) ||
            (input.roomId && s.roomId === input.roomId)
        );
        return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
          day => ({
            day,
            periods: periods.map(([start, end]) => ({
              start,
              end,
              free: !relevant.some(
                s =>
                  s.day === day && overlaps(start, end, s.startTime, s.endTime)
              ),
            })),
          })
        );
      }),
  }),

  // -------------------------------------------------------------------------
  analytics: router({
    overview: adminProcedure
      .input(z.object({ semester: z.number().int().min(1).max(2) }))
      .query(async ({ input }) => {
        const [
          sessionRows,
          assignments,
          staffRows,
          roomRows,
          courseRows,
          links,
          userRows,
          runs,
          policy,
          academic,
        ] = await Promise.all([
          listSessions(),
          getAssignments(),
          listStaff(),
          listRooms(),
          listCourses(),
          listCourseLecturers(),
          listUsers(),
          listGenerationRuns(),
          currentPolicy(),
          academicSettings(),
        ]);
        return buildAnalytics({
          semester: input.semester,
          academicYear: academic.academicYear,
          policy,
          sessions: sessionRows,
          assignments,
          staff: staffRows,
          rooms: roomRows,
          courses: courseRows,
          courseLecturers: links,
          users: userRows,
          runs,
        });
      }),
  }),

  // -------------------------------------------------------------------------
  profiles: router({
    mine: protectedProcedure.query(async ({ ctx }) => ({
      profile: await settingJson(`profile:${ctx.user.id}`, {}),
      pending: await settingJson(`profilePending:${ctx.user.id}`, null),
    })),
    submit: protectedProcedure
      .input(profileInput)
      .mutation(async ({ input, ctx }) => {
        await saveSetting(`profilePending:${ctx.user.id}`, {
          ...input,
          submittedAt: new Date().toISOString(),
          submittedBy: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          role: ctx.user.role,
        });
        await publishNotice({
          title: "Profile approval required",
          message: `${ctx.user.name || ctx.user.email} submitted updated profile details for approval.`,
          audience: "admin",
          authorId: ctx.user.id,
        });
        return { status: "pending" as const };
      }),
    pending: adminProcedure.query(async () =>
      (await listAppSettings())
        .filter(row => row.settingKey.startsWith("profilePending:"))
        .map(row => {
          let value: any = null;
          try {
            value = JSON.parse(row.settingValue);
          } catch {
            value = null;
          }
          return {
            key: row.settingKey,
            userId: Number(row.settingKey.split(":")[1]),
            value,
          };
        })
        .filter(row => row.value)
    ),
    approve: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          approved: z.boolean(),
          note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const pending = await settingJson<any>(
          `profilePending:${input.userId}`,
          null
        );
        if (pending && input.approved) {
          await saveSetting(`profile:${input.userId}`, pending);
          const db = await requireDb();
          await db
            .update(users)
            .set({
              phone: pending.phone || undefined,
              qualifications: pending.qualifications || undefined,
            })
            .where(eq(users.id, input.userId));
        }
        await saveSetting(`profilePending:${input.userId}`, null);
        await publishNotice({
          title: input.approved
            ? "Profile update approved"
            : "Profile update rejected",
          message: input.approved
            ? "Your profile changes are now live."
            : `Your profile changes were not approved.${input.note ? ` Note: ${input.note}` : ""}`,
          audience: "all",
          recipientUserIds: [input.userId],
        });
        return { approved: input.approved };
      }),
  }),

  // -------------------------------------------------------------------------
  notices: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const today = new Date().toISOString().slice(0, 10);
      return (await listNotices())
        .map(notice => {
          let recipients: number[] = [];
          try {
            recipients = notice.recipients ? JSON.parse(notice.recipients) : [];
          } catch {
            recipients = [];
          }
          return { ...notice, recipients };
        })
        .filter(
          item =>
            (item.audience === "all" || item.audience === ctx.user.role) &&
            (!item.recipients.length || item.recipients.includes(ctx.user.id))
        )
        .filter(item => !item.expiresAt || item.expiresAt >= today)
        .sort((a, b) => b.id - a.id)
        .slice(0, 100)
        .map(({ recipients, ...item }) => ({
          ...item,
          personal: recipients.length > 0,
        }));
    }),
    create: protectedProcedure
      .input(noticeInput)
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "lecturer"].includes(ctx.user.role))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only administrators and lecturers can publish notices.",
          });
        await publishNotice({ ...input, authorId: ctx.user.id });
        const recipients = (await listUsers()).filter(
          user => input.audience === "all" || user.role === input.audience
        );
        await emailUsers(
          recipients,
          `UOV notice: ${input.title}`,
          input.message
        );
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const notice = (await listNotices()).find(n => n.id === input.id);
        if (!notice) return input.id;
        if (ctx.user.role !== "admin" && notice.authorId !== ctx.user.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete notices that you published.",
          });
        await db.delete(notices).where(eq(notices.id, input.id));
        return input.id;
      }),
  }),

  // -------------------------------------------------------------------------
  teaching: router({
    mine: protectedProcedure.query(async ({ ctx }) =>
      settingJson<any[]>(`teaching:${ctx.user.id}`, [])
    ),
    save: protectedProcedure
      .input(teachingInput)
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "lecturer")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only lecturers can save teaching subjects.",
          });
        const rows = await settingJson<any[]>(`teaching:${ctx.user.id}`, []);
        await saveSetting(`teaching:${ctx.user.id}`, [
          ...rows.filter(
            row =>
              row.year !== input.year || row.department !== input.department
          ),
          input,
        ]);
        return input;
      }),
  }),

  // -------------------------------------------------------------------------
  swaps: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listSwaps();
      const sessionRows = await enrichedSessions();
      const userRows = await listUsers();
      return rows
        .filter(
          row => ctx.user.role === "admin" || row.requesterId === ctx.user.id
        )
        .sort((a, b) => b.id - a.id)
        .map(row => ({
          ...row,
          session: sessionRows.find(s => s.id === row.sessionId) || null,
          requesterName:
            userRows.find(u => u.id === row.requesterId)?.name || "Lecturer",
        }));
    }),
    request: protectedProcedure
      .input(swapInput)
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "lecturer")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only lecturers can request timetable swaps.",
          });
        const db = await requireDb();
        const result = await db
          .insert(timetableSwaps)
          .values({ ...input, requesterId: ctx.user.id });
        const message = `Your change request for ${input.requestedDay} ${input.requestedStartTime}–${input.requestedEndTime} was sent to the administrator.`;
        await publishNotice({
          title: "Change request submitted",
          message,
          audience: "lecturer",
          recipientUserIds: [ctx.user.id],
        });
        await publishNotice({
          title: "Timetable change request",
          message: `${ctx.user.name || ctx.user.email} requested to move a session to ${input.requestedDay} ${input.requestedStartTime}–${input.requestedEndTime}: ${input.reason}`,
          audience: "admin",
        });
        return Number((result as any)[0]?.insertId);
      }),
    review: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          reviewerNote: z.string().optional(),
          apply: z.boolean().default(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const swap = (await listSwaps()).find(item => item.id === input.id);
        if (!swap)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Request not found",
          });
        if (input.status === "approved" && input.apply)
          await applyReschedule({
            id: swap.sessionId,
            day: swap.requestedDay,
            startTime: swap.requestedStartTime,
            endTime: swap.requestedEndTime,
          });
        await db
          .update(timetableSwaps)
          .set({
            status: input.status,
            reviewerId: ctx.user.id,
            reviewerNote: input.reviewerNote || null,
          })
          .where(eq(timetableSwaps.id, input.id));
        const requester = await getUserById(swap.requesterId);
        if (requester) {
          const message = `Your timetable change request was ${input.status}.${input.reviewerNote ? ` Note: ${input.reviewerNote}` : ""}`;
          await publishNotice({
            title: `Change request ${input.status}`,
            message,
            audience: "lecturer",
            recipientUserIds: [requester.id],
          });
          if (requester.email)
            await sendEmail({
              to: requester.email,
              subject: `UOV change request ${input.status}`,
              text: message,
            });
        }
        return input.id;
      }),
  }),
});

// ---------------------------------------------------------------------------
// Internal helpers that need the db
// ---------------------------------------------------------------------------
function courseValues(input: z.infer<typeof courseInput>) {
  return {
    code: input.code,
    name: input.name,
    credits: input.credits,
    program: input.program,
    level: input.level,
    semester: input.semester,
    category: input.category,
    theoryHours: input.theoryHours,
    practicalHours: input.practicalHours,
    weeklyHours: input.theoryHours + input.practicalHours,
    expectedStudents: input.expectedStudents ?? null,
    preferredRoomId: input.preferredRoomId ?? null,
    practicalRoomId: input.practicalRoomId ?? null,
    description: input.description ?? null,
    objective: input.objective ?? null,
    learningOutcomes: input.learningOutcomes
      ? JSON.stringify(input.learningOutcomes.filter(Boolean))
      : null,
    contents: input.contents ?? null,
    prerequisites: input.prerequisites ?? null,
    teachingMethods: input.teachingMethods ?? null,
    evaluation: input.evaluation ?? null,
    readings: input.readings
      ? JSON.stringify(input.readings.filter(Boolean))
      : null,
    active: input.active ? 1 : 0,
  };
}

function sessionValues(values: Omit<SessionInput, "staffIds" | "id">) {
  const level = values.level ?? levelNumber(values.batch);
  const program = values.program ?? normalizeProgram(values.batch);
  return {
    ...values,
    program: program ?? null,
    level: level ?? null,
    courseId: values.courseId ?? null,
    roomId: values.roomId ?? null,
    batch: values.batch || cohortLabel(program, level),
  };
}

/** Link a lecturer to every declared course whose code appears in their teaching profile. */
async function linkStaffToCourses(staffId: number, expertise?: string | null) {
  const codes = codesIn(expertise);
  if (!codes.length) return 0;
  const db = await requireDb();
  const courseRows = (await listCourses()).filter(c => codes.includes(c.code));
  const links = await listCourseLecturers();
  let added = 0;
  for (const course of courseRows) {
    if (links.some(l => l.courseId === course.id && l.staffId === staffId))
      continue;
    await db.insert(courseLecturers).values({ courseId: course.id, staffId });
    added++;
  }
  return added;
}

async function autoAssignLecturers(all: boolean) {
  const db = await requireDb();
  const [staffRows, courseRows, existingLinks] = await Promise.all([
    listStaff(),
    listCourses(),
    listCourseLecturers(),
  ]);
  const links: Array<{ courseId: number; staffId: number }> = [
    ...existingLinks,
  ];
  let added = 0;
  for (const course of courseRows) {
    const hasLink = links.some(l => l.courseId === course.id);
    if (hasLink && !all) continue;
    for (const person of staffRows) {
      if (!codesIn(person.expertise).includes(course.code)) continue;
      if (links.some(l => l.courseId === course.id && l.staffId === person.id))
        continue;
      await db
        .insert(courseLecturers)
        .values({ courseId: course.id, staffId: person.id });
      links.push({ courseId: course.id, staffId: person.id });
      added++;
    }
  }
  return added;
}

async function applyReschedule(input: {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  roomId?: number | null;
}) {
  const db = await requireDb();
  const source = await findSession(input.id);
  if (!source)
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  const staffIds = (await getAssignments())
    .filter(a => a.sessionId === input.id)
    .map(a => a.staffId);
  const roomId = input.roomId === undefined ? source.roomId : input.roomId;
  const issues = await findConflicts({
    ...source,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    roomId,
    id: input.id,
    staffIds,
  } as any);
  if (issues.length) {
    await notifyConfigured(
      "rejection",
      "Timetable change rejected",
      issues.join(" • ")
    );
    throw new TRPCError({ code: "CONFLICT", message: issues.join(" • ") });
  }
  await db
    .update(sessions)
    .set({
      day: input.day,
      startTime: input.startTime,
      endTime: input.endTime,
      roomId,
      durationMinutes: minutes(input.endTime) - minutes(input.startTime),
      status: "rescheduled",
    })
    .where(eq(sessions.id, input.id));
  const message = `${source.subjectCode} – ${source.subjectName} moved from ${source.day} ${source.startTime} to ${input.day} ${input.startTime}–${input.endTime}.`;
  await notifyConfigured("reschedule", "Session rescheduled", message);
  await notifySessionAudience(source, "Session rescheduled", message);
  return input.id;
}

export type AppRouter = typeof appRouter;
