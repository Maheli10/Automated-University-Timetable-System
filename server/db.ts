import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ensureSchema } from "./setupSchema";

let _db: ReturnType<typeof drizzle> | null = null;
let _schemaReady: Promise<void> | null = null;
async function safeRead<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (process.env.LOCAL_DEMO_MODE === "true") {
      console.warn(
        "[Database] Read failed in demo mode; using fallback:",
        error instanceof Error ? error.message : error
      );
      return fallback;
    }
    throw error;
  }
}
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      _schemaReady = ensureSchema(_db, process.env.DATABASE_URL).catch(
        error => {
          console.warn(
            "[Database] Automatic schema setup failed:",
            error instanceof Error ? error.message : error
          );
        }
      );
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
    }
  }
  if (_schemaReady) await _schemaReady;
  return _db;
}
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    loginMethod: user.loginMethod,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "student"),
    lastSignedIn: user.lastSignedIn ?? new Date(),
    staffCode: user.staffCode,
    batch: user.batch,
  };
  const roleUpdate =
    user.role !== undefined || user.openId === ENV.ownerOpenId
      ? { role: values.role }
      : {};
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        name: values.name,
        email: values.email,
        passwordHash: values.passwordHash,
        loginMethod: values.loginMethod,
        ...roleUpdate,
        staffCode: values.staffCode,
        batch: values.batch,
        lastSignedIn: values.lastSignedIn,
      },
    });
}
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return safeRead(
    async () =>
      (
        await db.select().from(users).where(eq(users.openId, openId)).limit(1)
      )[0],
    undefined
  );
}
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return safeRead(
    async () =>
      (await db.select().from(users).where(eq(users.id, id)).limit(1))[0],
    undefined
  );
}
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  return safeRead(
    async () =>
      (await db.select().from(users).where(eq(users.email, email)).limit(1))[0],
    undefined
  );
}
export async function listSwaps() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(timetableSwaps), []) : [];
}
export async function listStaff() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(staff), []) : [];
}
export async function listRooms() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(rooms), []) : [];
}
export async function listSessions() {
  const db = await getDb();
  if (!db) return [];
  return safeRead(
    () =>
      db
        .select({ session: sessions, room: rooms })
        .from(sessions)
        .leftJoin(rooms, eq(sessions.roomId, rooms.id)),
    []
  );
}
export async function getAssignments() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(sessionStaff), []) : [];
}
export async function findSession(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return safeRead(
    async () =>
      (await db.select().from(sessions).where(eq(sessions.id, id)).limit(1))[0],
    undefined
  );
}
export async function listSessionExceptions(sessionId?: number) {
  const db = await getDb();
  if (!db) return [];
  return safeRead(
    () =>
      sessionId
        ? db
            .select()
            .from(sessionExceptions)
            .where(eq(sessionExceptions.sessionId, sessionId))
        : db.select().from(sessionExceptions),
    []
  );
}
export async function listAppSettings() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(appSettings), []) : [];
}
export async function listCourses() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(courses), []) : [];
}
export async function listCourseLecturers() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(courseLecturers), []) : [];
}
export async function listNotices() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(notices), []) : [];
}
export async function listGenerationRuns() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(generationRuns), []) : [];
}
export async function listUsers() {
  const db = await getDb();
  return db ? safeRead(() => db.select().from(users), []) : [];
}
export {
  courses,
  courseLecturers,
  notices,
  generationRuns,
  and,
  eq,
  ne,
  users,
  staff,
  rooms,
  sessions,
  sessionStaff,
  sessionExceptions,
  appSettings,
  timetableSwaps,
};
