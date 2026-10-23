/**
 * UOV automatic timetable engine.
 *
 * Approach (graph-colouring / DSatur style):
 *   1. Every course is decomposed into weekly teaching units:
 *        - theory hours  -> one-period (55 min) lectures, ideally on different days
 *        - practical hours -> two-period blocks placed only in the official practical slots
 *   2. Each unit is a vertex; units that share a student cohort, a lecturer or a room
 *      cannot share a period (edges). Periods × rooms are the "colours".
 *   3. The unit with the fewest remaining feasible options (highest saturation) is
 *      placed first, at the option with the best soft-constraint score.
 *   4. Anything left over is retried in progressively relaxed passes so that every
 *      subject gets a slot whenever it is physically possible, and a precise reason
 *      is reported when it is not.
 *
 * The engine is pure (no database access) so it can be unit tested.
 */
import {
  getCandidateSlots,
  minutes,
  overlaps,
  type ConstraintPolicy,
} from "./constraints";
import { cohortsFor, cohortLabel, DAYS } from "../shared/courseCode";

export type SchedCourse = {
  id: number;
  code: string;
  name: string;
  program: string;
  level: number;
  semester: number;
  category: string;
  theoryHours: number;
  practicalHours: number;
  expectedStudents?: number | null;
  preferredRoomId?: number | null;
  practicalRoomId?: number | null;
  lecturers: {
    staffId: number;
    component?: string | null;
    role?: string | null;
  }[];
};
export type SchedStaff = {
  id: number;
  name: string;
  status: string;
  availability?: string | null;
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
};
export type SchedRoom = {
  id: number;
  code: string;
  name: string;
  type: string;
  capacity: number;
  status: string;
  equipment?: string | null;
};
export type FixedSession = {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  roomId: number | null;
  staffIds: number[];
  cohorts: string[];
  elective?: boolean;
  courseCode?: string;
  classType?: string;
};
export type Placement = {
  unitId: string;
  courseId: number;
  code: string;
  name: string;
  program: string;
  level: number;
  category: string;
  classType: "Theory" | "Practical";
  day: string;
  startTime: string;
  endTime: string;
  roomId: number | null;
  staffIds: number[];
  participants: number;
  cohorts: string[];
  pass: number;
  notes: string[];
};
export type UnscheduledUnit = {
  courseId: number;
  code: string;
  name: string;
  cohort: string;
  classType: "Theory" | "Practical";
  hours: number;
  reason: string;
};
export type ScheduleResult = {
  placements: Placement[];
  unscheduled: UnscheduledUnit[];
  warnings: string[];
  stats: {
    courses: number;
    units: number;
    placed: number;
    unplaced: number;
    placedByPass: Record<string, number>;
    requiredHours: number;
    scheduledHours: number;
    runtimeMs: number;
    cohorts: Record<
      string,
      { required: number; placed: number; hours: number }
    >;
  };
};
export type ScheduleOptions = {
  policy: ConstraintPolicy;
  cohortSizes?: Record<string, number>;
  defaultCohortSize?: number;
  maxParallelElectives?: number;
  fixedSessions?: FixedSession[];
};

type Unit = {
  id: string;
  course: SchedCourse;
  classType: "Theory" | "Practical";
  periods: number; // 1 = lecture, 2 = practical block
  cohorts: string[];
  elective: boolean;
  participants: number;
  pool: number[]; // eligible lecturer ids (empty = no lecturer assigned)
};
type Option = {
  day: string;
  dayIndex: number;
  periodIdx: number[];
  roomId: number | null;
  staffId: number | null;
  score: number;
  notes: string[];
};

const isLab = (room: { type?: string | null; name?: string | null }) =>
  /lab|laborator|computer|workshop/i.test(`${room.type || ""}`) ||
  /\blab\b|laborator/i.test(`${room.name || ""}`);

export function roomFitsClassType(
  room: { type?: string | null; name?: string | null },
  classType: string
) {
  return classType === "Practical" ? isLab(room) : !isLab(room);
}

const parseAvailabilityBlocks = (availability: string | null | undefined) =>
  (availability || "")
    .split(/[;,\n]/)
    .map(value =>
      value.trim().match(/^(\w+)\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/i)
    )
    .filter(Boolean)
    .map(match => ({
      day: match![1].toLowerCase(),
      start: match![2],
      end: match![3],
    }));

export function generateTimetable(
  courses: SchedCourse[],
  staffList: SchedStaff[],
  roomList: SchedRoom[],
  options: ScheduleOptions
): ScheduleResult {
  const started = Date.now();
  const policy = options.policy;
  const defaultSize = options.defaultCohortSize ?? 50;
  const cohortSizes = options.cohortSizes ?? {};
  const maxParallel = Math.max(1, options.maxParallelElectives ?? 3);
  const warnings: string[] = [];

  // ---- time grid ---------------------------------------------------------
  const periods = getCandidateSlots("Theory", policy).map(([start, end]) => ({
    start,
    end,
  }));
  const practicalBlocks: number[][] = policy.practicalSlots
    .map(slot =>
      periods
        .map((period, index) => ({ period, index }))
        .filter(
          ({ period }) =>
            minutes(period.start) >= minutes(slot.start) &&
            minutes(period.end) <= minutes(slot.end) + 5
        )
        .map(({ index }) => index)
    )
    .filter(block => block.length >= 2)
    .map(block => block.slice(0, 2));
  const blockedPeriod = (day: string, index: number) =>
    policy.enforceBlockedPeriods &&
    policy.blockedPeriods.some(
      blocked =>
        blocked.day.toLowerCase() === day.toLowerCase() &&
        overlaps(
          periods[index].start,
          periods[index].end,
          blocked.start,
          blocked.end
        )
    );
  const periodMinutes = (index: number) =>
    minutes(periods[index].end) - minutes(periods[index].start);
  const spanOf = (idx: number[]) => ({
    start: periods[idx[0]].start,
    end: periods[idx[idx.length - 1]].end,
  });

  // ---- resources ---------------------------------------------------------
  const staffById = new Map(staffList.map(person => [person.id, person]));
  const activeStaff = new Set(
    staffList
      .filter(person => person.status === "active")
      .map(person => person.id)
  );
  const availabilityBlocks = new Map(
    staffList.map(person => [
      person.id,
      parseAvailabilityBlocks(person.availability),
    ])
  );
  const usableRooms = roomList.filter(room => room.status === "available");
  const labs = usableRooms.filter(isLab);
  const halls = usableRooms.filter(room => !isLab(room));
  if (!labs.length)
    warnings.push(
      "No laboratory rooms are available, so practical sessions cannot be placed. Add rooms whose type contains “Lab”."
    );
  if (!halls.length)
    warnings.push(
      "No lecture halls are available, so theory sessions cannot be placed."
    );

  // ---- occupancy ---------------------------------------------------------
  const roomBusy = new Set<string>();
  const staffBusy = new Set<string>();
  const cohortCore = new Set<string>();
  const cohortElective = new Map<string, number>();
  const cohortDayCourses = new Map<string, Set<string>>();
  const cohortDayStarts = new Map<string, Set<number>>();
  const cohortDayPracticals = new Map<string, number>();
  const staffDayMinutes = new Map<string, number>();
  const staffWeekMinutes = new Map<number, number>();
  const staffDayPeriods = new Map<string, Set<number>>();
  const courseDays = new Map<number, Set<number>>();

  const k = (...parts: Array<string | number>) => parts.join("|");
  const addToSet = <T>(map: Map<string, Set<T>>, key: string, value: T) => {
    const set = map.get(key) || new Set<T>();
    set.add(value);
    map.set(key, set);
  };

  const occupy = (args: {
    day: string;
    periodIdx: number[];
    roomId: number | null;
    staffIds: number[];
    cohorts: string[];
    elective: boolean;
    courseKey: string;
    practical: boolean;
    courseId?: number;
  }) => {
    const { day, periodIdx } = args;
    for (const p of periodIdx) {
      if (args.roomId) roomBusy.add(k(args.roomId, day, p));
      for (const staffId of args.staffIds) {
        staffBusy.add(k(staffId, day, p));
        addToSet(staffDayPeriods, k(staffId, day), p);
      }
      for (const cohort of args.cohorts) {
        if (args.elective)
          cohortElective.set(
            k(cohort, day, p),
            (cohortElective.get(k(cohort, day, p)) || 0) + 1
          );
        else cohortCore.add(k(cohort, day, p));
      }
    }
    const duration = periodIdx.reduce((sum, p) => sum + periodMinutes(p), 0);
    for (const staffId of args.staffIds) {
      staffDayMinutes.set(
        k(staffId, day),
        (staffDayMinutes.get(k(staffId, day)) || 0) + duration
      );
      staffWeekMinutes.set(
        staffId,
        (staffWeekMinutes.get(staffId) || 0) + duration
      );
    }
    for (const cohort of args.cohorts) {
      addToSet(cohortDayCourses, k(cohort, day), args.courseKey);
      addToSet(cohortDayStarts, k(cohort, day), periodIdx[0]);
      if (args.practical)
        cohortDayPracticals.set(
          k(cohort, day),
          (cohortDayPracticals.get(k(cohort, day)) || 0) + 1
        );
    }
    if (args.courseId !== undefined) {
      const set = courseDays.get(args.courseId) || new Set<number>();
      set.add(DAYS.indexOf(day));
      courseDays.set(args.courseId, set);
    }
  };

  // Existing sessions that must be respected (manual / temporary / other runs).
  for (const fixed of options.fixedSessions || []) {
    const idx = periods
      .map((period, index) => ({ period, index }))
      .filter(({ period }) =>
        overlaps(fixed.startTime, fixed.endTime, period.start, period.end)
      )
      .map(({ index }) => index);
    if (!idx.length || !DAYS.includes(fixed.day)) continue;
    occupy({
      day: fixed.day,
      periodIdx: idx,
      roomId: fixed.roomId,
      staffIds: fixed.staffIds,
      cohorts: fixed.cohorts,
      elective: Boolean(fixed.elective),
      courseKey: fixed.courseCode || `fixed-${fixed.id}`,
      practical: fixed.classType === "Practical",
    });
  }

  // ---- units -------------------------------------------------------------
  const units: Unit[] = [];
  const cohortRequired: Record<
    string,
    { required: number; placed: number; hours: number }
  > = {};
  let requiredHours = 0;
  for (const course of courses) {
    const cohorts = cohortsFor(course.program, course.level);
    if (!cohorts.length) continue;
    const size =
      course.expectedStudents && course.expectedStudents > 0
        ? course.expectedStudents
        : cohorts.reduce(
            (sum, cohort) => sum + (cohortSizes[cohort] || defaultSize),
            0
          );
    const elective =
      course.category === "elective" || course.category === "optional";
    const lecturerIds = course.lecturers
      .map(item => item.staffId)
      .filter(id => activeStaff.has(id));
    const componentPool = (component: "theory" | "practical") => {
      const matching = course.lecturers
        .filter(
          item =>
            activeStaff.has(item.staffId) &&
            (!item.component ||
              item.component === "both" ||
              item.component === component)
        )
        .sort(
          (a, b) =>
            (a.role === "coordinator" ? -1 : 0) -
            (b.role === "coordinator" ? -1 : 0)
        )
        .map(item => item.staffId);
      return matching.length ? matching : lecturerIds;
    };
    if (!lecturerIds.length && course.theoryHours + course.practicalHours > 0)
      warnings.push(
        `${course.code} ${course.name}: no active lecturer is assigned — sessions are scheduled with “Lecturer TBA”.`
      );
    const theoryCount = Math.max(0, Math.round(course.theoryHours));
    const practicalCount = Math.max(0, Math.ceil(course.practicalHours / 2));
    for (let i = 0; i < theoryCount; i++)
      units.push({
        id: `${course.id}-T${i + 1}`,
        course,
        classType: "Theory",
        periods: 1,
        cohorts,
        elective,
        participants: size,
        pool: componentPool("theory"),
      });
    for (let i = 0; i < practicalCount; i++)
      units.push({
        id: `${course.id}-P${i + 1}`,
        course,
        classType: "Practical",
        periods: 2,
        cohorts,
        elective,
        participants: size,
        pool: componentPool("practical"),
      });
    requiredHours += theoryCount + practicalCount * 2;
    for (const cohort of cohorts) {
      cohortRequired[cohort] = cohortRequired[cohort] || {
        required: 0,
        placed: 0,
        hours: 0,
      };
      cohortRequired[cohort].required += theoryCount + practicalCount * 2;
    }
  }

  // ---- feasibility -------------------------------------------------------
  type PassRules = {
    sameDay: boolean;
    dailyLimit: boolean;
    capacity: boolean;
    workload: boolean;
    roomType: boolean;
  };
  const passes: PassRules[] = [
    {
      sameDay: true,
      dailyLimit: true,
      capacity: true,
      workload: true,
      roomType: true,
    },
    {
      sameDay: false,
      dailyLimit: false,
      capacity: true,
      workload: true,
      roomType: true,
    },
    {
      sameDay: false,
      dailyLimit: false,
      capacity: false,
      workload: true,
      roomType: true,
    },
    {
      sameDay: false,
      dailyLimit: false,
      capacity: false,
      workload: false,
      roomType: true,
    },
    {
      sameDay: false,
      dailyLimit: false,
      capacity: false,
      workload: false,
      roomType: false,
    },
  ];

  const startsFor = (unit: Unit): number[][] =>
    unit.periods === 2 ? practicalBlocks : periods.map((_, index) => [index]);

  const cohortsFree = (unit: Unit, day: string, idx: number[]) =>
    unit.cohorts.every(cohort =>
      idx.every(p => {
        if (cohortCore.has(k(cohort, day, p))) return false;
        const electives = cohortElective.get(k(cohort, day, p)) || 0;
        return unit.elective ? electives < maxParallel : electives === 0;
      })
    );

  const staffFree = (
    staffId: number,
    day: string,
    idx: number[],
    rules: PassRules
  ) => {
    if (idx.some(p => staffBusy.has(k(staffId, day, p)))) return false;
    const blocks = availabilityBlocks.get(staffId) || [];
    const span = spanOf(idx);
    if (
      blocks.some(
        block =>
          block.day === day.toLowerCase() &&
          overlaps(span.start, span.end, block.start, block.end)
      )
    )
      return false;
    if (!rules.workload) return true;
    const person = staffById.get(staffId);
    if (!person) return true;
    const duration = idx.reduce((sum, p) => sum + periodMinutes(p), 0);
    return (
      (staffDayMinutes.get(k(staffId, day)) || 0) + duration <=
        person.maxDailyMinutes &&
      (staffWeekMinutes.get(staffId) || 0) + duration <= person.maxWeeklyMinutes
    );
  };

  const candidateRooms = (unit: Unit, rules: PassRules) => {
    const typed = rules.roomType
      ? unit.classType === "Practical"
        ? labs
        : halls
      : usableRooms;
    const preferredId =
      unit.classType === "Practical"
        ? unit.course.practicalRoomId || unit.course.preferredRoomId
        : unit.course.preferredRoomId;
    const preferred = preferredId
      ? usableRooms.filter(room => room.id === preferredId)
      : [];
    const list = [
      ...preferred,
      ...typed.filter(room => room.id !== preferredId),
    ];
    return rules.capacity
      ? list.filter(room => room.capacity >= unit.participants)
      : list;
  };

  const evaluate = (
    unit: Unit,
    rules: PassRules,
    wantScores: boolean
  ): { count: number; best: Option | null } => {
    let count = 0;
    let best: Option | null = null;
    const rooms = candidateRooms(unit, rules);
    if (!rooms.length) return { count: 0, best: null };
    const usedDays = courseDays.get(unit.course.id) || new Set<number>();
    DAYS.forEach((day, dayIndex) => {
      for (const idx of startsFor(unit)) {
        if (idx.some(p => blockedPeriod(day, p))) continue;
        if (!cohortsFree(unit, day, idx)) continue;
        if (
          rules.sameDay &&
          policy.preventSameSubjectSameDay &&
          unit.cohorts.some(cohort =>
            cohortDayCourses.get(k(cohort, day))?.has(unit.course.code)
          )
        )
          continue;
        if (rules.dailyLimit) {
          const overLimit = unit.cohorts.some(cohort => {
            const starts = cohortDayStarts.get(k(cohort, day));
            const sessions = starts
              ? starts.size + (starts.has(idx[0]) ? 0 : 1)
              : 1;
            if (sessions > policy.maxBatchClassesPerDay) return true;
            return (
              unit.classType === "Practical" &&
              (cohortDayPracticals.get(k(cohort, day)) || 0) + 1 >
                policy.maxBatchPracticalsPerDay
            );
          });
          if (overLimit) continue;
        }
        let staffId: number | null = null;
        if (unit.pool.length) {
          const free = unit.pool.filter(id => staffFree(id, day, idx, rules));
          if (!free.length) continue;
          staffId = free.sort(
            (a, b) =>
              (staffWeekMinutes.get(a) || 0) - (staffWeekMinutes.get(b) || 0)
          )[0];
        }
        const room = rooms.find(candidate =>
          idx.every(p => !roomBusy.has(k(candidate.id, day, p)))
        );
        if (!room) continue;
        count++;
        if (!wantScores) continue;
        // ---- soft constraint score (lower is better) ----
        let score = 0;
        const notes: string[] = [];
        for (const cohort of unit.cohorts) {
          const starts = cohortDayStarts.get(k(cohort, day));
          const load = starts?.size || 0;
          score += load * 4;
          if (cohortDayCourses.get(k(cohort, day))?.has(unit.course.code))
            score += 40;
          const occupied = (p: number) =>
            cohortCore.has(k(cohort, day, p)) ||
            (cohortElective.get(k(cohort, day, p)) || 0) > 0;
          const before = idx[0] - 1;
          const after = idx[idx.length - 1] + 1;
          const adjacent =
            (before >= 0 && occupied(before)) ||
            (after < periods.length && occupied(after));
          if (load && adjacent) score -= 3;
          if (load && !adjacent) score += 2;
          // avoid long runs of consecutive lectures for students
          let run = idx.length;
          for (let p = before; p >= 0 && occupied(p); p--) run++;
          for (let p = after; p < periods.length && occupied(p); p++) run++;
          if (
            run >
            policy.maxConsecutiveLectures + (unit.periods === 2 ? 1 : 0)
          )
            score += 12;
          if (unit.elective)
            score += (cohortElective.get(k(cohort, day, idx[0])) || 0) * 6;
        }
        if (minutes(periods[idx[0]].start) >= minutes("15:30")) score += 6;
        if (usedDays.has(dayIndex)) score += 30;
        if (usedDays.has(dayIndex - 1) || usedDays.has(dayIndex + 1))
          score += 3;
        if (staffId) {
          const periodsToday = staffDayPeriods.get(k(staffId, day));
          score += (periodsToday?.size || 0) * 1.5;
          let run = idx.length;
          for (let p = idx[0] - 1; p >= 0 && periodsToday?.has(p); p--) run++;
          for (
            let p = idx[idx.length - 1] + 1;
            p < periods.length && periodsToday?.has(p);
            p++
          )
            run++;
          if (run > policy.maxConsecutiveLectures + 1) score += 10;
        }
        const preferredId =
          unit.classType === "Practical"
            ? unit.course.practicalRoomId || unit.course.preferredRoomId
            : unit.course.preferredRoomId;
        if (preferredId && room.id === preferredId) score -= 6;
        if (room.capacity >= unit.participants)
          score +=
            ((room.capacity - unit.participants) / Math.max(room.capacity, 1)) *
            3;
        else {
          score += 20;
          notes.push(
            `Room capacity ${room.capacity} is below the expected ${unit.participants} students`
          );
        }
        if (!roomFitsClassType(room, unit.classType))
          notes.push(
            `${unit.classType} placed in ${room.type} (no suitable ${unit.classType === "Practical" ? "lab" : "hall"} free)`
          );
        score += dayIndex * 0.01 + idx[0] * 0.001; // deterministic tie-break
        if (!best || score < best.score)
          best = {
            day,
            dayIndex,
            periodIdx: idx,
            roomId: room.id,
            staffId,
            score,
            notes,
          };
      }
    });
    return { count, best };
  };

  // ---- DSatur placement loop ----------------------------------------------
  const placements: Placement[] = [];
  const placedByPass: Record<string, number> = {};
  let remaining = [...units];
  passes.forEach((rules, passIndex) => {
    const failed: Unit[] = [];
    let pending = [...remaining];
    while (pending.length) {
      // choose the most constrained unit
      let chosen = -1;
      let chosenCount = Infinity;
      for (let i = 0; i < pending.length; i++) {
        const { count } = evaluate(pending[i], rules, false);
        const unit = pending[i];
        const tieBreak = chosen >= 0 ? pending[chosen] : null;
        if (
          count < chosenCount ||
          (count === chosenCount &&
            tieBreak &&
            (unit.periods > tieBreak.periods ||
              (unit.periods === tieBreak.periods &&
                unit.participants > tieBreak.participants)))
        ) {
          chosen = i;
          chosenCount = count;
        }
        if (count === 0) break;
      }
      const unit = pending.splice(chosen, 1)[0];
      if (chosenCount === 0) {
        failed.push(unit);
        continue;
      }
      const { best } = evaluate(unit, rules, true);
      if (!best) {
        failed.push(unit);
        continue;
      }
      const span = spanOf(best.periodIdx);
      occupy({
        day: best.day,
        periodIdx: best.periodIdx,
        roomId: best.roomId,
        staffIds: best.staffId ? [best.staffId] : [],
        cohorts: unit.cohorts,
        elective: unit.elective,
        courseKey: unit.course.code,
        practical: unit.classType === "Practical",
        courseId: unit.course.id,
      });
      const notes = [...best.notes];
      if (passIndex === 1)
        notes.push(
          "Placed after relaxing the same-day / daily-load preferences"
        );
      if (passIndex === 3)
        notes.push("Placed after relaxing lecturer workload limits");
      if (!unit.pool.length) notes.push("Lecturer TBA");
      placements.push({
        unitId: unit.id,
        courseId: unit.course.id,
        code: unit.course.code,
        name: unit.course.name,
        program: unit.course.program,
        level: unit.course.level,
        category: unit.course.category,
        classType: unit.classType,
        day: best.day,
        startTime: span.start,
        endTime: span.end,
        roomId: best.roomId,
        staffIds: best.staffId ? [best.staffId] : [],
        participants: unit.participants,
        cohorts: unit.cohorts,
        pass: passIndex + 1,
        notes,
      });
      placedByPass[`pass${passIndex + 1}`] =
        (placedByPass[`pass${passIndex + 1}`] || 0) + 1;
      for (const cohort of unit.cohorts)
        if (cohortRequired[cohort]) cohortRequired[cohort].placed++;
    }
    remaining = failed;
  });

  // ---- diagnose leftovers -------------------------------------------------
  const unscheduled: UnscheduledUnit[] = remaining.map(unit => {
    const relaxed = passes[passes.length - 1];
    let reason = "No common free period for the cohort, lecturer and a room.";
    if (unit.classType === "Practical" && !labs.length)
      reason = "No laboratory room is available.";
    else if (unit.classType === "Theory" && !halls.length)
      reason = "No lecture hall is available.";
    else {
      const cohortOpen = DAYS.some(day =>
        startsFor(unit).some(
          idx =>
            !idx.some(p => blockedPeriod(day, p)) && cohortsFree(unit, day, idx)
        )
      );
      if (!cohortOpen)
        reason = `${unit.cohorts.map(c => c.replace("-L", " Level ")).join(" / ")} has no free ${unit.periods === 2 ? "practical slot" : "period"} left in the week (weekly load exceeds available periods).`;
      else if (unit.pool.length) {
        const lecturerOpen = DAYS.some(day =>
          startsFor(unit).some(
            idx =>
              cohortsFree(unit, day, idx) &&
              unit.pool.some(id => staffFree(id, day, idx, relaxed))
          )
        );
        if (!lecturerOpen)
          reason = `Assigned lecturer${unit.pool.length > 1 ? "s are" : " is"} (${unit.pool.map(id => staffById.get(id)?.name || id).join(", ")}) already teaching in every period the cohort is free.`;
        else
          reason =
            "Every suitable room is already booked in the periods where the cohort and lecturer are free.";
      } else
        reason =
          "Every suitable room is already booked in the periods where the cohort is free.";
    }
    return {
      courseId: unit.course.id,
      code: unit.course.code,
      name: unit.course.name,
      cohort: cohortLabel(unit.course.program, unit.course.level),
      classType: unit.classType,
      hours: unit.periods,
      reason,
    };
  });

  for (const placement of placements)
    for (const cohort of placement.cohorts)
      if (cohortRequired[cohort])
        cohortRequired[cohort].hours +=
          placement.classType === "Practical" ? 2 : 1;

  return {
    placements,
    unscheduled,
    warnings: Array.from(new Set(warnings)),
    stats: {
      courses: courses.length,
      units: units.length,
      placed: placements.length,
      unplaced: unscheduled.length,
      placedByPass,
      requiredHours,
      scheduledHours: placements.reduce(
        (sum, item) => sum + (item.classType === "Practical" ? 2 : 1),
        0
      ),
      runtimeMs: Date.now() - started,
      cohorts: cohortRequired,
    },
  };
}
