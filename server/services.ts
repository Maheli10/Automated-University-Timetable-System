import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDb,
  listAppSettings,
  listSessions,
  getAssignments,
  listStaff,
  listUsers,
  listSessionExceptions,
  listRooms,
  appSettings,
  notices,
} from "./db";
import { sendEmail } from "./email";
import {
  cohortsFor,
  levelNumber,
  normalizeProgram,
  semesterNumber,
} from "../shared/courseCode";
import {
  parseConstraintPolicy,
  validateTimeConstraints,
  overlaps,
} from "./constraints";
import type { User } from "../drizzle/schema";

export async function requireDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Database is not configured. Check DATABASE_URL in .env and make sure MySQL is running.",
    });
  return db;
}

export async function settingJson<T>(key: string, fallback: T): Promise<T> {
  const row = (await listAppSettings()).find(item => item.settingKey === key);
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.settingValue);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function saveSetting(key: string, value: unknown) {
  const db = await requireDb();
  const settingValue = JSON.stringify(value);
  await db
    .insert(appSettings)
    .values({ settingKey: key, settingValue })
    .onDuplicateKeyUpdate({ set: { settingValue } });
}

export const academicInput = z.object({
  academicYear: z
    .string()
    .regex(/^20\d{2}\/20\d{2}$/)
    .default("2025/2026"),
  currentSemester: z.number().int().min(1).max(2).default(1),
  defaultCohortSize: z.number().int().min(1).max(1000).default(50),
  maxParallelElectives: z.number().int().min(1).max(6).default(3),
});
export type AcademicSettings = z.infer<typeof academicInput>;

export async function academicSettings(): Promise<AcademicSettings> {
  const value = await settingJson<any>("academic", {});
  const parsed = academicInput.safeParse(value || {});
  return parsed.success ? parsed.data : academicInput.parse({});
}

export async function currentPolicy() {
  const settings = await listAppSettings();
  return parseConstraintPolicy(
    settings.find(row => row.settingKey === "constraintPolicy")?.settingValue
  );
}

// ---------------------------------------------------------------------------
// Notices & e-mail
// ---------------------------------------------------------------------------
export type NoticeAudience = "all" | "student" | "lecturer" | "admin";

export async function publishNotice(notice: {
  title: string;
  message: string;
  audience: NoticeAudience;
  expiresAt?: string;
  recipientUserIds?: number[];
  authorId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notices).values({
    title: notice.title.slice(0, 200),
    message: notice.message,
    audience: notice.audience,
    recipients: notice.recipientUserIds?.length
      ? JSON.stringify(notice.recipientUserIds)
      : null,
    authorId: notice.authorId ?? null,
    expiresAt: notice.expiresAt || null,
  });
}

export async function emailUsers(
  userRows: { email?: string | null }[],
  subject: string,
  text: string
) {
  await Promise.all(
    userRows
      .filter(user => user.email)
      .map(user => sendEmail({ to: user.email!, subject, text }))
  );
}

// ---------------------------------------------------------------------------
// Cohort helpers — which students attend which sessions
// ---------------------------------------------------------------------------
export function sessionCohorts(session: {
  program?: string | null;
  level?: number | null;
  batch?: string | null;
}): string[] {
  if (session.level) return cohortsFor(session.program || "IT", session.level);
  const level = levelNumber(session.batch);
  if (!level) return [];
  const program = normalizeProgram(session.batch);
  return program
    ? cohortsFor(program, level)
    : [`IT-L${level}`, `AMC-L${level}`];
}

export function userCohort(user: Pick<User, "program" | "level" | "batch">) {
  const level = user.level || levelNumber(user.batch);
  if (!level) return null;
  const program = (user.program ||
    normalizeProgram(user.batch) ||
    "IT") as string;
  return `${program}-L${level}`;
}

export function studentCanSee(
  user: Pick<User, "program" | "level" | "batch">,
  session: {
    program?: string | null;
    level?: number | null;
    batch?: string | null;
  }
) {
  const cohort = userCohort(user);
  if (cohort) return sessionCohorts(session).includes(cohort);
  return (
    String(session.batch || "")
      .trim()
      .toLowerCase() ===
    String(user.batch || "")
      .trim()
      .toLowerCase()
  );
}

export const sameSemester = (
  a?: string | number | null,
  b?: string | number | null
) => {
  const left = semesterNumber(a as any);
  const right = semesterNumber(b as any);
  return !left || !right || left === right;
};

// ---------------------------------------------------------------------------
// Audience of a session (lecturers + students) for change notifications
// ---------------------------------------------------------------------------
export async function sessionAudience(sessionId: number, session: any) {
  const assignments = (await getAssignments()).filter(
    item => item.sessionId === sessionId
  );
  const staffIds = new Set(assignments.map(item => item.staffId));
  const staffRows = await listStaff();
  const staffEmails = new Set(
    staffRows
      .filter(person => staffIds.has(person.id))
      .map(person => (person.email || "").toLowerCase())
  );
  const staffCodes = new Set(
    staffRows
      .filter(person => staffIds.has(person.id))
      .map(person => person.staffCode)
  );
  return (await listUsers()).filter(
    user =>
      (user.role === "lecturer" &&
        ((user.staffCode && staffCodes.has(user.staffCode)) ||
          (user.email && staffEmails.has(user.email.toLowerCase())))) ||
      (user.role === "student" && studentCanSee(user, session))
  );
}

export async function notifySessionAudience(
  session: any,
  title: string,
  message: string
) {
  const recipients = await sessionAudience(session.id, session);
  if (!recipients.length) return;
  await publishNotice({
    title,
    message,
    audience: "all",
    recipientUserIds: recipients.map(user => user.id),
  });
  await emailUsers(recipients, `UOV timetable: ${title}`, message);
}

// ---------------------------------------------------------------------------
// Room suitability & manual conflict detection
// ---------------------------------------------------------------------------
const requestedFacilities = (value?: string | null) =>
  (value || "")
    .split(/[,;]/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

export const isLabRoom = (room: {
  type?: string | null;
  name?: string | null;
}) =>
  /lab|laborator|computer|workshop/i.test(room.type || "") ||
  /\blab\b/i.test(room.name || "");

export const roomSuitable = (
  room: any,
  input: { classType?: string; requirements?: string | null }
) => {
  const equipment =
    `${room.equipment || ""};${room.accessibility || ""}`.toLowerCase();
  const facilities = requestedFacilities(input.requirements).every(item =>
    equipment.includes(item)
  );
  const suitable =
    input.classType === "Practical"
      ? isLabRoom(room)
      : !isLabRoom(room) || input.classType === "Tutorial";
  return facilities && suitable;
};

export type SessionCheckInput = {
  id?: number;
  subjectCode: string;
  classType: string;
  batch: string;
  program?: string | null;
  level?: number | null;
  semester?: string | null;
  studentGroup?: string | null;
  day: string;
  startTime: string;
  endTime: string;
  sessionDate?: string | null;
  roomId?: number | null;
  participantCount: number;
  staffIds: number[];
  requirements?: string | null;
};

export async function findConflicts(input: SessionCheckInput) {
  const [existing, exceptions, policy, assignments, roomList, staffRows] =
    await Promise.all([
      listSessions(),
      listSessionExceptions(),
      currentPolicy(),
      getAssignments(),
      listRooms(),
      listStaff(),
    ]);
  const inputCohorts = sessionCohorts(input);
  const active = existing.filter(
    x =>
      x.session.status !== "cancelled" &&
      !(
        input.sessionDate &&
        x.session.scheduleType === "routine" &&
        exceptions.some(
          exception =>
            exception.sessionId === x.session.id &&
            exception.occurrenceDate === input.sessionDate &&
            exception.status === "cancelled"
        )
      ) &&
      (!input.id || x.session.id !== input.id) &&
      sameSemester(x.session.semester, input.semester) &&
      x.session.day === input.day
  );
  const overlapping = active.filter(x =>
    overlaps(
      input.startTime,
      input.endTime,
      x.session.startTime,
      x.session.endTime
    )
  );
  const sharesCohort = (row: any) => {
    const rowCohorts = sessionCohorts(row);
    if (inputCohorts.length && rowCohorts.length)
      return rowCohorts.some(c => inputCohorts.includes(c));
    return (
      String(row.batch).trim().toLowerCase() ===
      String(input.batch).trim().toLowerCase()
    );
  };
  const issues: string[] = [...validateTimeConstraints(input, policy)];
  const sameDayCohort = active.filter(row => sharesCohort(row.session));
  if (sameDayCohort.length >= policy.maxBatchClassesPerDay)
    issues.push(
      `This cohort already has the maximum ${policy.maxBatchClassesPerDay} classes on ${input.day}`
    );
  if (
    input.classType === "Practical" &&
    sameDayCohort.filter(row => row.session.classType === "Practical").length >=
      policy.maxBatchPracticalsPerDay
  )
    issues.push(
      `This cohort already has the maximum ${policy.maxBatchPracticalsPerDay} practical sessions on ${input.day}`
    );
  const staffName = (id: number) =>
    staffRows.find(person => person.id === id)?.name || `Lecturer #${id}`;
  for (const x of overlapping) {
    const label = `${x.session.subjectCode} (${x.session.startTime}–${x.session.endTime})`;
    if (input.roomId && x.session.roomId === input.roomId)
      issues.push(`Room overlap with ${label}`);
    if (
      sharesCohort(x.session) ||
      (!!input.studentGroup && x.session.studentGroup === input.studentGroup)
    )
      issues.push(`Batch/cohort overlap with ${label}`);
    const otherStaff = assignments
      .filter(a => a.sessionId === x.session.id)
      .map(a => a.staffId);
    for (const id of input.staffIds.filter(id => otherStaff.includes(id)))
      issues.push(`Staff overlap: ${staffName(id)} teaches ${label}`);
  }
  const room = roomList.find(r => r.id === input.roomId);
  if (room && room.status === "maintenance")
    issues.push(`${room.name} is under maintenance`);
  if (room && room.capacity < input.participantCount)
    issues.push(
      `${room.name} has only ${room.capacity} seats for ${input.participantCount} participants`
    );
  if (room && !roomSuitable(room, input))
    issues.push(
      `${room.name} does not match the requested facilities or ${input.classType.toLowerCase()} room suitability`
    );
  for (const staffId of input.staffIds) {
    const person = staffRows.find(p => p.id === staffId);
    if (person?.status === "on-leave")
      issues.push(`${person.name} is on leave`);
  }
  if (issues.length) {
    const alternatives = roomList
      .filter(
        r =>
          r.status === "available" &&
          r.capacity >= input.participantCount &&
          roomSuitable(r, input) &&
          !overlapping.some(x => x.session.roomId === r.id)
      )
      .slice(0, 3)
      .map(r => r.name);
    if (
      alternatives.length &&
      issues.some(issue => /room|seats|suitab|maintenance/i.test(issue))
    )
      issues.push(
        `Free suitable rooms at this time: ${alternatives.join(", ")}`
      );
  }
  return Array.from(new Set(issues));
}
