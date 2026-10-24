import {
  getCandidateSlots,
  minutes,
  overlaps,
  type ConstraintPolicy,
} from "./constraints";
import {
  cohortLabel,
  cohortsFor,
  DAYS,
  semesterNumber,
} from "../shared/courseCode";
import { sessionCohorts, isLabRoom } from "./services";

type Row = Record<string, any>;

const round = (value: number, digits = 1) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const hoursOf = (session: Row) =>
  Math.max(0, minutes(session.endTime) - minutes(session.startTime)) / 60;
/** Teaching hours counted the university way: a 55-minute period = 1 hour. */
const teachingHours = (session: Row) =>
  Math.max(
    1,
    Math.round((minutes(session.endTime) - minutes(session.startTime)) / 55)
  );

export function buildAnalytics(input: {
  semester: number;
  academicYear: string;
  policy: ConstraintPolicy;
  sessions: Array<{ session: Row; room: Row | null }>;
  assignments: Row[];
  staff: Row[];
  rooms: Row[];
  courses: Row[];
  courseLecturers: Row[];
  users: Row[];
  runs: Row[];
}) {
  const { semester, policy } = input;
  const periods = getCandidateSlots("Theory", policy).map(([start, end]) => ({
    start,
    end,
    label: `${start}–${end}`,
  }));
  const totalPeriods = periods.length * DAYS.length;
  const semesterSessions = input.sessions
    .map(row => row.session)
    .filter(session => {
      const value = semesterNumber(session.semester);
      return !value || value === semester;
    });
  const active = semesterSessions.filter(
    session => session.status !== "cancelled"
  );
  const staffBySession = new Map<number, number[]>();
  for (const assignment of input.assignments)
    staffBySession.set(assignment.sessionId, [
      ...(staffBySession.get(assignment.sessionId) || []),
      assignment.staffId,
    ]);
  const semesterCourses = input.courses.filter(
    course => course.semester === semester && course.active !== 0
  );
  const courseById = new Map(input.courses.map(course => [course.id, course]));

  const occupiedPeriods = (list: Row[]) => {
    const map: Record<string, Set<number>> = Object.fromEntries(
      DAYS.map(day => [day, new Set<number>()])
    );
    for (const session of list)
      periods.forEach((period, index) => {
        if (
          map[session.day] &&
          overlaps(session.startTime, session.endTime, period.start, period.end)
        )
          map[session.day].add(index);
      });
    return map;
  };
  const freeMap = (occupied: Record<string, Set<number>>) =>
    Object.fromEntries(
      DAYS.map(day => [
        day,
        periods
          .filter((_, index) => !occupied[day].has(index))
          .map(period => period.label),
      ])
    );
  const perDayHours = (list: Row[]) =>
    Object.fromEntries(
      DAYS.map(day => [
        day,
        round(
          list
            .filter(s => s.day === day)
            .reduce((sum, s) => sum + teachingHours(s), 0)
        ),
      ])
    );

  // ---- students ------------------------------------------------------------
  const students = input.users.filter(user => user.role === "student");
  const studentCohort = (user: Row) =>
    user.level ? `${user.program || "IT"}-L${user.level}` : null;
  const cohortStudentCount = (cohort: string) =>
    students.filter(user => studentCohort(user) === cohort).length;

  // ---- batches / cohorts ---------------------------------------------------
  const cohortKeys = ["IT", "AMC"].flatMap(program =>
    [1, 2, 3, 4].map(level => `${program}-L${level}`)
  );
  const batches = cohortKeys.map(cohort => {
    const [program, levelText] = cohort.split("-L");
    const level = Number(levelText);
    const list = active.filter(session =>
      sessionCohorts(session).includes(cohort)
    );
    const occupied = occupiedPeriods(list);
    const occupiedCount = DAYS.reduce(
      (sum, day) => sum + occupied[day].size,
      0
    );
    const courseCodes = new Set(list.map(session => session.subjectCode));
    const declared = semesterCourses.filter(course =>
      cohortsFor(course.program, course.level).includes(cohort)
    );
    const perDay = perDayHours(list);
    return {
      cohort,
      label: cohortLabel(program, level),
      program,
      level,
      students: cohortStudentCount(cohort),
      declaredCourses: declared.length,
      courses: courseCodes.size,
      sessions: list.length,
      hours: round(list.reduce((sum, s) => sum + teachingHours(s), 0)),
      theoryHours: round(
        list
          .filter(s => s.classType !== "Practical")
          .reduce((sum, s) => sum + teachingHours(s), 0)
      ),
      practicalHours: round(
        list
          .filter(s => s.classType === "Practical")
          .reduce((sum, s) => sum + teachingHours(s), 0)
      ),
      credits: declared.reduce((sum, course) => sum + (course.credits || 0), 0),
      perDay,
      busiestDay: DAYS.reduce(
        (best, day) => (perDay[day] > perDay[best] ? day : best),
        DAYS[0]
      ),
      freePeriods: totalPeriods - occupiedCount,
      freeByDay: freeMap(occupied),
    };
  });

  // ---- lecturers -----------------------------------------------------------
  const lecturers = input.staff.map(person => {
    const list = active.filter(session =>
      (staffBySession.get(session.id) || []).includes(person.id)
    );
    const occupied = occupiedPeriods(list);
    const occupiedCount = DAYS.reduce(
      (sum, day) => sum + occupied[day].size,
      0
    );
    const hours = list.reduce((sum, s) => sum + teachingHours(s), 0);
    const assignedCourses = input.courseLecturers
      .filter(item => item.staffId === person.id)
      .map(item => courseById.get(item.courseId))
      .filter(course => course && course.semester === semester)
      .map(course => course!.code);
    const maxWeeklyHours = round((person.maxWeeklyMinutes || 2400) / 60);
    return {
      id: person.id,
      name: person.name,
      staffCode: person.staffCode,
      role: person.role,
      status: person.status,
      sessions: list.length,
      hours: round(hours),
      theoryHours: round(
        list
          .filter(s => s.classType !== "Practical")
          .reduce((sum, s) => sum + teachingHours(s), 0)
      ),
      practicalHours: round(
        list
          .filter(s => s.classType === "Practical")
          .reduce((sum, s) => sum + teachingHours(s), 0)
      ),
      courses: Array.from(
        new Set([...list.map(s => s.subjectCode), ...assignedCourses])
      ).sort(),
      perDay: perDayHours(list),
      freePeriods: totalPeriods - occupiedCount,
      freeByDay: freeMap(occupied),
      maxWeeklyHours,
      loadPct: round((hours / Math.max(1, maxWeeklyHours)) * 100),
      flag: "balanced" as
        | "overloaded"
        | "balanced"
        | "underloaded"
        | "unassigned"
        | "on-leave",
    };
  });
  const teaching = lecturers.filter(l => l.status === "active" && l.hours > 0);
  const mean = teaching.length
    ? teaching.reduce((sum, l) => sum + l.hours, 0) / teaching.length
    : 0;
  const stdDev = teaching.length
    ? Math.sqrt(
        teaching.reduce((sum, l) => sum + (l.hours - mean) ** 2, 0) /
          teaching.length
      )
    : 0;
  for (const lecturer of lecturers) {
    if (lecturer.status !== "active") lecturer.flag = "on-leave";
    else if (!lecturer.hours) lecturer.flag = "unassigned";
    else if (
      lecturer.hours > lecturer.maxWeeklyHours ||
      (mean && lecturer.hours > mean + 1.5 * Math.max(stdDev, 1))
    )
      lecturer.flag = "overloaded";
    else if (mean && lecturer.hours < mean - 1.5 * Math.max(stdDev, 1))
      lecturer.flag = "underloaded";
  }
  const lecturerBalance = {
    mean: round(mean),
    stdDev: round(stdDev),
    min: teaching.length ? Math.min(...teaching.map(l => l.hours)) : 0,
    max: teaching.length ? Math.max(...teaching.map(l => l.hours)) : 0,
    cv: mean ? round((stdDev / mean) * 100) : 0,
    balanceScore: mean ? Math.max(0, round(100 - (stdDev / mean) * 100)) : 0,
    overloaded: lecturers.filter(l => l.flag === "overloaded").length,
    underloaded: lecturers.filter(l => l.flag === "underloaded").length,
    unassigned: lecturers.filter(l => l.flag === "unassigned").length,
  };

  // ---- rooms -----------------------------------------------------------------
  const rooms = input.rooms.map(room => {
    const list = active.filter(session => session.roomId === room.id);
    const occupied = occupiedPeriods(list);
    const occupiedCount = DAYS.reduce(
      (sum, day) => sum + occupied[day].size,
      0
    );
    const fills = list.map(s =>
      room.capacity ? (s.participantCount || 0) / room.capacity : 0
    );
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      type: room.type,
      kind: isLabRoom(room) ? "Laboratory" : "Lecture hall",
      capacity: room.capacity,
      status: room.status,
      sessions: list.length,
      hours: round(list.reduce((sum, s) => sum + teachingHours(s), 0)),
      utilization: round((occupiedCount / totalPeriods) * 100),
      avgFill: fills.length
        ? round((fills.reduce((a, b) => a + b, 0) / fills.length) * 100)
        : 0,
      perDay: perDayHours(list),
      freePeriods: totalPeriods - occupiedCount,
      freeByDay: freeMap(occupied),
    };
  });
  const roomKinds = ["Lecture hall", "Laboratory"].map(kind => {
    const list = rooms.filter(room => room.kind === kind);
    return {
      kind,
      rooms: list.length,
      seats: list.reduce((sum, room) => sum + room.capacity, 0),
      utilization: list.length
        ? round(
            list.reduce((sum, room) => sum + room.utilization, 0) / list.length
          )
        : 0,
      hours: round(list.reduce((sum, room) => sum + room.hours, 0)),
    };
  });

  // ---- programmes / departments ---------------------------------------------
  const programs = ["IT", "AMC", "COMMON"].map(program => {
    const list = input.courses.filter(
      course => course.program === program && course.active !== 0
    );
    const semList = list.filter(course => course.semester === semester);
    return {
      program,
      courses: list.length,
      semesterCourses: semList.length,
      core: semList.filter(course => course.category === "core").length,
      electives: semList.filter(course => course.category !== "core").length,
      credits: semList.reduce((sum, course) => sum + (course.credits || 0), 0),
      theoryHours: semList.reduce(
        (sum, course) => sum + (course.theoryHours || 0),
        0
      ),
      practicalHours: semList.reduce(
        (sum, course) => sum + (course.practicalHours || 0),
        0
      ),
      byLevel: [1, 2, 3, 4].map(level => ({
        level,
        semester1: list.filter(
          course => course.level === level && course.semester === 1
        ).length,
        semester2: list.filter(
          course => course.level === level && course.semester === 2
        ).length,
      })),
      withLecturer: semList.filter(course =>
        input.courseLecturers.some(item => item.courseId === course.id)
      ).length,
      withDetails: semList.filter(
        course => course.objective || course.learningOutcomes
      ).length,
    };
  });

  const studentStats = {
    total: students.length,
    it: students.filter(user => user.program === "IT").length,
    amc: students.filter(user => user.program === "AMC").length,
    unassigned: students.filter(user => !user.program || !user.level).length,
    activated: students.filter(
      user => user.passwordHash || !user.mustChangePassword
    ).length,
    byLevel: [1, 2, 3, 4].map(level => ({
      level,
      IT: students.filter(user => user.program === "IT" && user.level === level)
        .length,
      AMC: students.filter(
        user => user.program === "AMC" && user.level === level
      ).length,
    })),
  };

  // ---- class types, day load and heatmap ---------------------------------------
  const classTypes = ["Theory", "Practical", "Tutorial"].map(type => ({
    type,
    sessions: active.filter(s => (s.classType || "Theory") === type).length,
    hours: round(
      active
        .filter(s => (s.classType || "Theory") === type)
        .reduce((sum, s) => sum + teachingHours(s), 0)
    ),
  }));
  const dayLoad = DAYS.map(day => ({
    day,
    sessions: active.filter(s => s.day === day).length,
    hours: round(
      active
        .filter(s => s.day === day)
        .reduce((sum, s) => sum + teachingHours(s), 0)
    ),
  }));
  const heatmap = periods.map(period => ({
    period: period.label,
    ...Object.fromEntries(
      DAYS.map(day => [
        day,
        active.filter(
          s =>
            s.day === day &&
            overlaps(s.startTime, s.endTime, period.start, period.end)
        ).length,
      ])
    ),
  }));

  // ---- conflicts ------------------------------------------------------------------
  const conflicts: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    message: string;
    sessionIds: number[];
  }> = [];
  const staffName = new Map(
    input.staff.map(person => [person.id, person.name])
  );
  const roomById = new Map(input.rooms.map(room => [room.id, room]));
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (
        a.day !== b.day ||
        !overlaps(a.startTime, a.endTime, b.startTime, b.endTime)
      )
        continue;
      if (
        a.scheduleType === "temporary" &&
        b.scheduleType === "temporary" &&
        a.sessionDate !== b.sessionDate
      )
        continue;
      const when = `${a.day} ${a.startTime}–${a.endTime}`;
      if (a.roomId && a.roomId === b.roomId)
        conflicts.push({
          type: "Room clash",
          severity: "high",
          message: `${roomById.get(a.roomId)?.name || "Room"} is double-booked: ${a.subjectCode} and ${b.subjectCode} on ${when}`,
          sessionIds: [a.id, b.id],
        });
      const sharedStaff = (staffBySession.get(a.id) || []).filter(id =>
        (staffBySession.get(b.id) || []).includes(id)
      );
      for (const id of sharedStaff)
        conflicts.push({
          type: "Lecturer clash",
          severity: "high",
          message: `${staffName.get(id) || "A lecturer"} teaches ${a.subjectCode} and ${b.subjectCode} on ${when}`,
          sessionIds: [a.id, b.id],
        });
      const aCohorts = sessionCohorts(a);
      const bCohorts = sessionCohorts(b);
      const shared = aCohorts.filter(c => bCohorts.includes(c));
      const bothElective = [a, b].every(
        s =>
          courseById.get(s.courseId)?.category === "elective" ||
          /^EL/i.test(s.subjectCode)
      );
      if (shared.length && !bothElective)
        conflicts.push({
          type: "Student clash",
          severity: "high",
          message: `${shared.map(c => c.replace("-L", " Level ")).join(", ")} has ${a.subjectCode} and ${b.subjectCode} at the same time (${when})`,
          sessionIds: [a.id, b.id],
        });
    }
    const room = a.roomId ? roomById.get(a.roomId) : null;
    if (room && room.capacity < (a.participantCount || 0))
      conflicts.push({
        type: "Capacity",
        severity: "medium",
        message: `${a.subjectCode} expects ${a.participantCount} students but ${room.name} seats ${room.capacity}`,
        sessionIds: [a.id],
      });
    if (room && room.status === "maintenance")
      conflicts.push({
        type: "Room unavailable",
        severity: "medium",
        message: `${a.subjectCode} is booked in ${room.name}, which is under maintenance`,
        sessionIds: [a.id],
      });
    if (!a.roomId)
      conflicts.push({
        type: "No room",
        severity: "low",
        message: `${a.subjectCode} (${a.day} ${a.startTime}) has no lecture hall assigned`,
        sessionIds: [a.id],
      });
    if (!(staffBySession.get(a.id) || []).length)
      conflicts.push({
        type: "No lecturer",
        severity: "low",
        message: `${a.subjectCode} (${a.day} ${a.startTime}) has no lecturer assigned`,
        sessionIds: [a.id],
      });
    const breakHit = policy.breaks.find(period =>
      overlaps(a.startTime, a.endTime, period.start, period.end)
    );
    if (breakHit)
      conflicts.push({
        type: "Break overlap",
        severity: "medium",
        message: `${a.subjectCode} on ${a.day} overlaps the ${breakHit.label}`,
        sessionIds: [a.id],
      });
  }
  const conflictSummary = Object.entries(
    conflicts.reduce<Record<string, number>>(
      (acc, item) => ({ ...acc, [item.type]: (acc[item.type] || 0) + 1 }),
      {}
    )
  ).map(([type, count]) => ({ type, count }));

  // ---- unscheduled ------------------------------------------------------------------
  const runs = [...input.runs]
    .filter(run => run.semester === semester)
    .sort((a, b) => b.id - a.id);
  const latestRun = runs[0] || null;
  let latestReport: any = null;
  try {
    latestReport = latestRun?.report ? JSON.parse(latestRun.report) : null;
  } catch {
    latestReport = null;
  }
  const unscheduled = semesterCourses
    .map(course => {
      const list = active.filter(
        s =>
          s.courseId === course.id ||
          (!s.courseId && s.subjectCode === course.code)
      );
      const theoryDone = list
        .filter(s => s.classType !== "Practical")
        .reduce((sum, s) => sum + teachingHours(s), 0);
      const practicalDone = list
        .filter(s => s.classType === "Practical")
        .reduce((sum, s) => sum + teachingHours(s), 0);
      const practicalRequired = Math.ceil((course.practicalHours || 0) / 2) * 2;
      const missingTheory = Math.max(0, (course.theoryHours || 0) - theoryDone);
      const missingPractical = Math.max(0, practicalRequired - practicalDone);
      const reasons = (latestReport?.unscheduled || [])
        .filter((item: any) => item.code === course.code)
        .map((item: any) => item.reason);
      return {
        courseId: course.id,
        code: course.code,
        name: course.name,
        cohort: cohortLabel(course.program, course.level),
        requiredHours: (course.theoryHours || 0) + practicalRequired,
        scheduledHours: theoryDone + practicalDone,
        missingTheory,
        missingPractical,
        reason:
          reasons[0] ||
          (list.length
            ? "Some sessions were removed or cancelled after generation"
            : latestRun
              ? "Not placed by the last generation run"
              : "Timetable not generated yet"),
      };
    })
    .filter(item => item.missingTheory + item.missingPractical > 0);

  const totalHours = round(
    active.reduce((sum, s) => sum + teachingHours(s), 0)
  );
  const requiredHours = semesterCourses.reduce(
    (sum, course) =>
      sum +
      (course.theoryHours || 0) +
      Math.ceil((course.practicalHours || 0) / 2) * 2,
    0
  );
  const avgRoomUtil = rooms.filter(r => r.status === "available").length
    ? round(
        rooms
          .filter(r => r.status === "available")
          .reduce((sum, r) => sum + r.utilization, 0) /
          rooms.filter(r => r.status === "available").length
      )
    : 0;

  return {
    semester,
    academicYear: input.academicYear,
    generatedAt: new Date().toISOString(),
    periods: periods.map(p => p.label),
    summary: {
      courses: semesterCourses.length,
      totalCourses: input.courses.length,
      sessions: active.length,
      cancelled: semesterSessions.length - active.length,
      weeklyHours: totalHours,
      requiredHours,
      coverage: requiredHours
        ? Math.min(
            100,
            round((Math.min(totalHours, requiredHours) / requiredHours) * 100)
          )
        : 0,
      lecturers: input.staff.length,
      activeLecturers: input.staff.filter(person => person.status === "active")
        .length,
      rooms: input.rooms.length,
      students: students.length,
      conflicts: conflicts.filter(item => item.severity === "high").length,
      warnings: conflicts.filter(item => item.severity !== "high").length,
      unscheduledCourses: unscheduled.length,
      unscheduledHours: unscheduled.reduce(
        (sum, item) => sum + item.missingTheory + item.missingPractical,
        0
      ),
      roomUtilization: avgRoomUtil,
      lecturerBalance: lecturerBalance.balanceScore,
    },
    batches,
    lecturers,
    lecturerBalance,
    rooms,
    roomKinds,
    mostUsedRooms: [...rooms]
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 5),
    availableRooms: [...rooms]
      .filter(r => r.status === "available")
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, 5),
    programs,
    students: studentStats,
    classTypes,
    dayLoad,
    heatmap,
    conflicts,
    conflictSummary,
    unscheduled,
    generation: latestRun
      ? {
          id: latestRun.id,
          createdAt: latestRun.createdAt,
          scheduled: latestRun.scheduled,
          unscheduled: latestRun.unscheduled,
          stats: latestReport?.stats || null,
          warnings: latestReport?.warnings || [],
          unscheduledList: latestReport?.unscheduled || [],
        }
      : null,
    runs: runs
      .slice(0, 10)
      .map(run => ({
        id: run.id,
        createdAt: run.createdAt,
        scheduled: run.scheduled,
        unscheduled: run.unscheduled,
      })),
  };
}
export type AnalyticsReport = ReturnType<typeof buildAnalytics>;
