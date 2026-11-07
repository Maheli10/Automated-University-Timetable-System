import { z } from "zod";

export const periodSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().min(1).default("Blocked period"),
});

export const constraintPolicySchema = z.object({
  workingHours: z
    .object({ start: z.string(), end: z.string() })
    .default({ start: "08:30", end: "16:35" }),
  breaks: z.array(periodSchema).default([
    { start: "10:20", end: "10:40", label: "Official break" },
    { start: "12:30", end: "13:30", label: "Lunch break" },
    { start: "15:20", end: "15:40", label: "Official afternoon break" },
  ]),
  practicalSlots: z.array(periodSchema).default([
    { start: "08:30", end: "10:20", label: "Practical slot 1" },
    { start: "10:40", end: "12:30", label: "Practical slot 2" },
    { start: "13:30", end: "15:20", label: "Practical slot 3" },
  ]),
  blockedPeriods: z
    .array(
      z.object({
        day: z.string().min(1),
        start: z.string(),
        end: z.string(),
        label: z.string().min(1),
      })
    )
    .default([]),
  maxConsecutiveLectures: z.number().int().positive().default(3),
  minBreakMinutes: z.number().int().min(0).default(0),
  maxBatchClassesPerDay: z.number().int().positive().default(5),
  maxBatchPracticalsPerDay: z.number().int().positive().default(2),
  preventSameSubjectSameDay: z.boolean().default(true),
  enforcePracticalSlots: z.boolean().default(true),
  enforceWorkingHours: z.boolean().default(true),
  enforceBreaks: z.boolean().default(true),
  enforceBlockedPeriods: z.boolean().default(true),
  customRules: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        enabled: z.boolean().default(true),
        type: z
          .enum([
            "blocked-period",
            "max-daily-classes",
            "max-daily-practicals",
            "same-subject-day",
          ])
          .default("blocked-period"),
        value: z.string().optional(),
      })
    )
    .default([]),
});

export type ConstraintPolicy = z.infer<typeof constraintPolicySchema>;

const wednesdayAfternoonBlock = {
  day: "Wednesday",
  start: "12:30",
  end: "16:35",
  label: "Wednesday afternoon protected period",
};

export const defaultConstraintPolicy: ConstraintPolicy =
  constraintPolicySchema.parse({ blockedPeriods: [wednesdayAfternoonBlock] });

export function parseConstraintPolicy(value?: string | null): ConstraintPolicy {
  const official = {
    workingHours: { start: "08:30", end: "16:35" },
    breaks: [
      { start: "10:20", end: "10:40", label: "Tea break" },
      { start: "12:30", end: "13:30", label: "Lunch break" },
      { start: "15:20", end: "15:40", label: "Afternoon break" },
    ],
    practicalSlots: [
      { start: "08:30", end: "10:20", label: "Practical slot 1" },
      { start: "10:40", end: "12:30", label: "Practical slot 2" },
      { start: "13:30", end: "15:20", label: "Practical slot 3" },
    ],
  };
  if (!value)
    return {
      ...defaultConstraintPolicy,
      ...official,
      blockedPeriods: [wednesdayAfternoonBlock],
    };
  try {
    const parsed = constraintPolicySchema.parse(JSON.parse(value));
    return {
      ...parsed,
      ...official,
      blockedPeriods: [
        ...parsed.blockedPeriods.filter(
          period =>
            !(
              period.day.toLowerCase() === "wednesday" &&
              period.start === "12:30" &&
              period.end === "16:35"
            )
        ),
        wednesdayAfternoonBlock,
      ],
    };
  } catch {
    return {
      ...defaultConstraintPolicy,
      ...official,
      blockedPeriods: [wednesdayAfternoonBlock],
    };
  }
}

export function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  return minutes(startA) < minutes(endB) && minutes(endA) > minutes(startB);
}

export function isWithin(
  start: string,
  end: string,
  outerStart: string,
  outerEnd: string
) {
  return (
    minutes(start) >= minutes(outerStart) && minutes(end) <= minutes(outerEnd)
  );
}

export function isExactPeriod(
  start: string,
  end: string,
  periods: Array<{ start: string; end: string }>
) {
  return periods.some(period => period.start === start && period.end === end);
}

export function getCandidateSlots(classType: string, policy: ConstraintPolicy) {
  if (classType === "Practical" && policy.enforcePracticalSlots) {
    return policy.practicalSlots.map(
      period => [period.start, period.end] as [string, string]
    );
  }
  // Fixed UOV lecture periods: each lecture is exactly 55 minutes.
  return [
    ["08:30", "09:25"],
    ["09:25", "10:20"],
    ["10:40", "11:35"],
    ["11:35", "12:30"],
    ["13:30", "14:25"],
    ["14:25", "15:20"],
    ["15:40", "16:35"],
  ].filter(
    ([start, end]) =>
      !policy.breaks.some(period =>
        overlaps(start, end, period.start, period.end)
      )
  ) as Array<[string, string]>;
}

export function validateTimeConstraints(
  input: { day: string; startTime: string; endTime: string; classType: string },
  policy: ConstraintPolicy
) {
  const issues: string[] = [];
  if (minutes(input.startTime) >= minutes(input.endTime))
    issues.push("End time must be after start time");
  if (
    policy.enforceWorkingHours &&
    !isWithin(
      input.startTime,
      input.endTime,
      policy.workingHours.start,
      policy.workingHours.end
    )
  ) {
    issues.push(
      `Classes must be within university working hours (${policy.workingHours.start}–${policy.workingHours.end})`
    );
  }
  if (
    policy.enforceBreaks &&
    policy.breaks.some(period =>
      overlaps(input.startTime, input.endTime, period.start, period.end)
    )
  ) {
    const breakName =
      policy.breaks.find(period =>
        overlaps(input.startTime, input.endTime, period.start, period.end)
      )?.label || "a protected break";
    issues.push(`The class overlaps ${breakName}`);
  }
  if (
    input.classType === "Practical" &&
    policy.enforcePracticalSlots &&
    !isExactPeriod(input.startTime, input.endTime, policy.practicalSlots)
  ) {
    issues.push(
      "Practical sessions must use one complete university practical slot"
    );
  }
  if (
    policy.enforceBlockedPeriods &&
    policy.blockedPeriods.some(
      period =>
        period.day.toLowerCase() === input.day.toLowerCase() &&
        overlaps(input.startTime, input.endTime, period.start, period.end)
    )
  ) {
    const blocked = policy.blockedPeriods.find(
      period =>
        period.day.toLowerCase() === input.day.toLowerCase() &&
        overlaps(input.startTime, input.endTime, period.start, period.end)
    );
    issues.push(
      `The class overlaps blocked university period: ${blocked?.label || "event"}`
    );
  }
  return issues;
}
