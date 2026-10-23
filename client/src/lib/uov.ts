import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type SessionRow = RouterOutputs["sessions"]["list"][number];
export type CourseRow = RouterOutputs["courses"]["list"][number];
export type StaffRow = RouterOutputs["staff"]["list"][number];
export type RoomRow = RouterOutputs["rooms"]["list"][number];
export type AnalyticsData = RouterOutputs["analytics"]["overview"];

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;
export const SHORT_DAY: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
};

export const DEFAULT_PERIODS = [
  { start: "08:30", end: "09:25" },
  { start: "09:25", end: "10:20" },
  { start: "10:40", end: "11:35" },
  { start: "11:35", end: "12:30" },
  { start: "13:30", end: "14:25" },
  { start: "14:25", end: "15:20" },
  { start: "15:40", end: "16:35" },
];
export const PRACTICAL_SLOTS = [
  { start: "08:30", end: "10:20" },
  { start: "10:40", end: "12:30" },
  { start: "13:30", end: "15:20" },
];

export const COHORTS = ["IT", "AMC"].flatMap(program =>
  [1, 2, 3, 4].map(level => ({
    key: `${program}-L${level}`,
    program,
    level,
    label: `Level ${level} · ${program}`,
  }))
);

export const PROGRAM_NAMES: Record<string, string> = {
  IT: "Information Technology",
  AMC: "Applied Mathematics & Computing",
  COMMON: "Common (IT + AMC)",
};

export const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export const overlaps = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
) => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart);
export const durationLabel = (start: string, end: string) => {
  const total = Math.max(0, toMinutes(end) - toMinutes(start));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};
export const cohortName = (key: string) => {
  const [program, level] = key.split("-L");
  return `Level ${level} · ${program}`;
};

/** Stable, accessible colour per course code (used on timetable blocks). */
const PALETTE = [
  { bg: "#e8f0fe", border: "#2563eb", text: "#1e3a8a" },
  { bg: "#e0f5fb", border: "#0891b2", text: "#0e4a5c" },
  { bg: "#e3f6f1", border: "#0f9f8f", text: "#0b4d45" },
  { bg: "#ecebfd", border: "#4f46e5", text: "#312e81" },
  { bg: "#f2ebfd", border: "#7c3aed", text: "#4c1d95" },
  { bg: "#fdf2dd", border: "#d97706", text: "#78350f" },
  { bg: "#e5f5ea", border: "#16a34a", text: "#14532d" },
  { bg: "#fde9ef", border: "#db2777", text: "#831843" },
  { bg: "#e1f0fa", border: "#0369a1", text: "#0c3d5e" },
  { bg: "#e4eefc", border: "#1d4ed8", text: "#172554" },
];
export function courseColor(code: string) {
  let hash = 0;
  for (const char of code || "") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function downloadText(
  filename: string,
  content: string,
  type = "text/csv;charset=utf-8"
) {
  const blob = new Blob(["﻿" + content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

const csvCell = (value: unknown) => {
  const text =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join("; ")
        : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: { key: string; label: string }[]
) {
  if (!rows.length) return "";
  const cols =
    columns || Object.keys(rows[0]).map(key => ({ key, label: key }));
  return [
    cols.map(c => csvCell(c.label)).join(","),
    ...rows.map(row => cols.map(c => csvCell(row[c.key])).join(",")),
  ].join("\n");
}
export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; label: string }[]
) {
  downloadText(filename, toCsv(rows, columns));
}

export const sortSessions = <T extends { day: string; startTime: string }>(
  rows: T[]
) =>
  [...rows].sort(
    (a, b) =>
      DAYS.indexOf(a.day as any) - DAYS.indexOf(b.day as any) ||
      toMinutes(a.startTime) - toMinutes(b.startTime)
  );

export function sessionsToCsv(rows: SessionRow[]) {
  return sortSessions(rows).map(s => ({
    Day: s.day,
    Start: s.startTime,
    End: s.endTime,
    Code: s.subjectCode,
    Course: s.subjectName,
    Type: s.classType,
    Cohort: s.batch,
    Semester: s.semester,
    Lecturer: s.staff.map(p => p.name).join("; "),
    Room: s.room ? `${s.room.code} ${s.room.name}` : "",
    Students: s.participantCount,
    Status: s.status,
  }));
}

export const friendlyError = (error: unknown) => {
  const message = String(
    (error as any)?.message || error || "Something went wrong"
  );
  if (/failed query|ER_|sql/i.test(message))
    return "The database rejected the request. Please check the values and try again.";
  return message;
};

export const todayName = () => {
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return (DAYS as readonly string[]).includes(day) ? day : null;
};

export const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
};
