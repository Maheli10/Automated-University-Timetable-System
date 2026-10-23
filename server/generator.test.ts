import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateTimetable, type SchedCourse } from "./scheduler";
import { parseConstraintPolicy, overlaps } from "./constraints";
import {
  normalizeCourseRow,
  parseCsv,
  pick,
  deriveStudentCohort,
} from "../shared/courseCode";

const fixture = (name: string) =>
  parseCsv(fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf8"));

function loadData() {
  const byCode = new Map<string, any>();
  let id = 1;
  for (const row of fixture("courses.csv")) {
    const course = normalizeCourseRow(row)!;
    if (byCode.has(course.code)) continue;
    byCode.set(course.code, { ...course, id: id++, lecturers: [] });
  }
  const staff = fixture("lecturers.csv").map((row, index) => {
    const role = pick(row, "roleTitle");
    const person = {
      id: index + 1,
      name: pick(row, "name"),
      status: /study leave/i.test(role) ? "on-leave" : "active",
      availability: "",
      maxDailyMinutes: 480,
      maxWeeklyMinutes: 2400,
    };
    for (const cell of ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2"])
      for (const code of (row[cell] || "")
        .split(/[,;|/ ]+/)
        .map(c => c.trim().toUpperCase())
        .filter(Boolean)) {
        const course = byCode.get(code);
        if (
          course &&
          !course.lecturers.some((l: any) => l.staffId === person.id)
        )
          course.lecturers.push({ staffId: person.id });
      }
    return person;
  });
  const rooms = fixture("rooms.csv").map((row, index) => ({
    id: index + 1,
    code: row.code,
    name: row.name,
    type: row.type,
    capacity: Number(row.capacity),
    status: row.status || "available",
    equipment: row.equipment,
  }));
  return {
    courses: Array.from(byCode.values()) as SchedCourse[],
    staff,
    rooms,
  };
}

describe("automatic timetable generation with the faculty data", () => {
  const policy = parseConstraintPolicy(null);
  for (const semester of [1, 2]) {
    it(`schedules every teaching hour of every level for semester ${semester} without clashes`, () => {
      const data = loadData();
      const courses = data.courses.filter(c => c.semester === semester);
      const result = generateTimetable(courses, data.staff, data.rooms, {
        policy,
        defaultCohortSize: 50,
      });
      console.log(
        `S${semester}`,
        JSON.stringify(result.stats),
        result.unscheduled.slice(0, 10),
        result.warnings.length
      );
      expect(result.unscheduled).toEqual([]);
      const expected = courses.reduce(
        (sum, c) => sum + c.theoryHours + Math.ceil(c.practicalHours / 2) * 2,
        0
      );
      expect(result.stats.scheduledHours).toBe(expected);
      // every level of both programmes is present
      const levels = new Set(
        result.placements.map(p => `${p.program}-${p.level}`)
      );
      for (const level of [1, 2, 3]) {
        expect(levels.has(`IT-${level}`)).toBe(true);
        expect(levels.has(`AMC-${level}`)).toBe(true);
      }
      // hard constraints
      const list = result.placements;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i],
            b = list[j];
          if (
            a.day !== b.day ||
            !overlaps(a.startTime, a.endTime, b.startTime, b.endTime)
          )
            continue;
          expect(a.roomId === b.roomId, `room clash ${a.code}/${b.code}`).toBe(
            false
          );
          expect(
            a.staffIds.some(s => b.staffIds.includes(s)),
            `lecturer clash ${a.code}/${b.code}`
          ).toBe(false);
          const shared = a.cohorts.some(c => b.cohorts.includes(c));
          if (shared)
            expect(
              a.category === "elective" && b.category === "elective",
              `cohort clash ${a.code}/${b.code}`
            ).toBe(true);
        }
      for (const p of list) {
        if (p.classType === "Practical")
          expect(["08:30-10:20", "10:40-12:30", "13:30-15:20"]).toContain(
            `${p.startTime}-${p.endTime}`
          );
        expect(overlaps(p.startTime, p.endTime, "12:30", "13:30")).toBe(false);
        expect(overlaps(p.startTime, p.endTime, "10:20", "10:40")).toBe(false);
      }
    });
  }
  it("derives student programme and level from the registration number", () => {
    const student = fixture("students.csv")[0];
    const cohort = deriveStudentCohort({
      registrationNo: student.registrationNo,
      email: student.email,
      department: student.department,
      yearOfStudy: student.yearOfStudy,
      currentAcademicYear: "2025/2026",
    });
    expect(cohort.program).toBe("IT");
    expect(cohort.level).toBe(3);
    expect(
      deriveStudentCohort({
        registrationNo: "2023/ICT/12",
        currentAcademicYear: "2025/2026",
      }).level
    ).toBe(2);
    expect(
      deriveStudentCohort({
        registrationNo: "2024/AMC/12",
        yearOfStudy: "1st year",
      }).level
    ).toBe(1);
  });
});
