/**
 * `pnpm seed` — loads the faculty sample data (rooms, courses, lecturer
 * teaching profiles, students) from server/__fixtures__ and generates the
 * Semester 1 and Semester 2 timetables. Useful for demonstrations.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { appRouter } from "../server/routers";
import { getUserByEmail } from "../server/db";
import { parseCsv } from "../shared/courseCode";

const res: any = { setHeader() {}, clearCookie() {} };
const fixture = (name: string) =>
  parseCsv(fs.readFileSync(path.join("server", "__fixtures__", name), "utf8"));

async function main() {
  const anon = appRouter.createCaller({
    req: { headers: {} } as any,
    res,
    user: null,
  });
  await anon.auth.login({
    email: "admin@uov.local",
    password: "Admin@12345",
    role: "admin",
  });
  const admin = await getUserByEmail("admin@uov.local");
  if (!admin) throw new Error("Administrator account could not be created");
  const api = appRouter.createCaller({
    req: { headers: {} } as any,
    res,
    user: admin,
  });
  console.log(
    "Rooms     ",
    await api.rooms.bulkImport({ rows: fixture("rooms.csv") })
  );
  const courses = await api.courses.bulkImport({
    rows: fixture("courses.csv"),
  });
  console.log("Courses   ", {
    created: courses.created,
    updated: courses.updated,
    enriched: courses.enriched,
  });
  const staff = await api.staff.bulkImport({ rows: fixture("lecturers.csv") });
  console.log("Lecturers ", {
    created: staff.created,
    updated: staff.updated,
    accounts: staff.accounts,
    courseLinks: staff.mappings,
  });
  const students = await api.users.bulkStudents({
    rows: fixture("students.csv"),
  });
  console.log("Students  ", {
    created: students.created,
    updated: students.updated,
    skipped: students.skipped.length,
  });
  for (const semester of [1, 2]) {
    const run = await api.timetable.generate({
      semester,
      replace: "all-routine",
      notify: false,
    });
    console.log(
      `Semester ${semester} timetable: ${run.stats.placed} sessions placed, ${run.unscheduled.length} unplaced (${run.stats.runtimeMs} ms)`
    );
  }
  process.exit(0);
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
