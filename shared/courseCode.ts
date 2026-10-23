export type CourseCodeMeta = {
  yearOfStudy: number | null;
  semester: number | null;
  credit: number | null;
};

export type Program = "IT" | "AMC" | "COMMON";
export const PROGRAMS: Program[] = ["IT", "AMC", "COMMON"];
export const STUDENT_PROGRAMS = ["IT", "AMC"] as const;
export const LEVELS = [1, 2, 3, 4] as const;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const programLabel: Record<string, string> = {
  IT: "Information Technology",
  AMC: "Applied Mathematics & Computing",
  COMMON: "Common (IT + AMC)",
};

/**
 * UOV course-code convention, e.g. IT1134 / CSH4144:
 * digit 1 = level (year), digit 2 = semester, digit 3 = sequence,
 * digit 4 = credit value. Legacy five-digit codes use digit 4 for credit.
 */
export function parseCourseCode(code: string): CourseCodeMeta {
  const digits = String(code || "")
    .trim()
    .match(/(\d{4,5})(?!.*\d)/)?.[1];
  if (!digits) return { yearOfStudy: null, semester: null, credit: null };
  const year = Number(digits[0]);
  const semester = Number(digits[1]);
  const credit = Number(digits[digits.length === 5 ? 3 : 3]);
  return {
    yearOfStudy: year >= 1 && year <= 4 ? year : null,
    semester: semester === 1 || semester === 2 ? semester : null,
    credit: Number.isFinite(credit) && credit > 0 ? credit : null,
  };
}

/** Degree programme implied by the course prefix. */
export function programForCode(code: string): Program | null {
  const prefix = String(code || "")
    .trim()
    .toUpperCase()
    .match(/^[A-Z]+/)?.[0];
  if (!prefix) return null;
  if (prefix === "IT" || prefix === "EL") return "IT";
  if (["AMA", "PMA", "STA", "CSC", "CSH", "AMC", "MAT"].includes(prefix))
    return "AMC";
  if (prefix === "ACU") return "COMMON";
  return null;
}

export function normalizeProgram(value: unknown): Program | null {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!text) return null;
  if (/COMMON|SHARED|BOTH|ALL|ACU/.test(text)) return "COMMON";
  if (/AMC|APPLIED|MATH|CS\b|COMPUTER SCIENCE|CSC|CSH/.test(text)) return "AMC";
  if (/^IT$|ICT|INFORMATION|^BIT/.test(text) || text === "IT") return "IT";
  return null;
}

export function semesterNumber(
  value: string | number | null | undefined
): number | null {
  const match = String(value ?? "").match(/(?:semester|sem|s)?\s*([12])\b/i);
  return match ? Number(match[1]) : null;
}

export function semesterLabel(value: string | number | null | undefined) {
  const number = semesterNumber(value);
  return number ? `Semester ${number}` : String(value ?? "").trim();
}

/** "1st year", "Year 2", "L3", "level 4", "4" -> number */
export function levelNumber(value: unknown): number | null {
  const text = String(value ?? "").toLowerCase();
  const match =
    text.match(/(?:level|year|yr|l|y)\s*([1-4])\b/) ||
    text.match(/\b([1-4])(?:st|nd|rd|th)?\b/);
  return match ? Number(match[1]) : null;
}

export const ordinal = (n: number) =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

export function cohortLabel(
  program: string | null | undefined,
  level: number | null | undefined
) {
  if (!level) return program || "Unassigned";
  if (program === "COMMON") return `Level ${level} · IT + AMC`;
  return `Level ${level} · ${program || "IT"}`;
}

/** Student cohorts (conflict groups) that attend a course. */
export function cohortsFor(
  program: string | null | undefined,
  level: number | null | undefined
): string[] {
  if (!level) return [];
  if (program === "COMMON") return [`IT-L${level}`, `AMC-L${level}`];
  return [`${program || "IT"}-L${level}`];
}

export function courseBelongsToSemester(
  code: string,
  requestedSemester: string
): boolean {
  const parsed = parseCourseCode(code);
  const requested = semesterNumber(requestedSemester);
  return (
    requested === null ||
    parsed.semester === null ||
    parsed.semester === requested
  );
}

export type NormalizedCourse = {
  code: string;
  name: string;
  credits: number;
  program: Program;
  level: number;
  semester: number;
  category: "core" | "elective" | "optional";
  theoryHours: number;
  practicalHours: number;
  weeklyHours: number;
};

const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Turns a loosely formatted course row (CSV import, legacy JSON) into a
 * complete course definition. Missing level/semester/programme/credits are
 * derived from the course code.
 */
export function normalizeCourseRow(row: any): NormalizedCourse | null {
  const code = String(row?.subjectCode ?? row?.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const name = String(row?.subjectName ?? row?.name ?? "").trim();
  if (!/^[A-Z]{2,5}\d{4,5}$/.test(code) || !name) return null;
  const meta = parseCourseCode(code);
  const level =
    levelNumber(row?.level ?? row?.batch ?? row?.year) ?? meta.yearOfStudy ?? 1;
  const semester = semesterNumber(row?.semester) ?? meta.semester ?? 1;
  const program =
    programForCode(code) ??
    normalizeProgram(row?.program ?? row?.department) ??
    "IT";
  let theoryHours = num(row?.theoryHours);
  let practicalHours = num(row?.practicalHours);
  let weeklyHours = num(row?.weeklyHours);
  if (!theoryHours && !practicalHours && weeklyHours) theoryHours = weeklyHours;
  if (!weeklyHours) weeklyHours = theoryHours + practicalHours;
  const credits = num(row?.totalCredit ?? row?.credits) || meta.credit || 0;
  const rawCategory = String(row?.category ?? "").toLowerCase();
  const category =
    /elect/.test(rawCategory) || code.startsWith("EL")
      ? "elective"
      : /option/.test(rawCategory)
        ? "optional"
        : "core";
  return {
    code,
    name,
    credits: Math.round(credits),
    program,
    level,
    semester,
    category,
    theoryHours: Math.round(theoryHours),
    practicalHours: Math.round(practicalHours),
    weeklyHours: Math.round(weeklyHours),
  };
}

/** Parse a CSV/TSV text into an array of header-keyed objects (quotes supported). */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(value.trim());
      value = "";
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(cell => cell !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map(cell => cell.trim());
  return rows
    .slice(1)
    .map(cells =>
      Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""]))
    );
}

/** Case/space-insensitive column lookup for imported rows. */
export function pick(row: Record<string, string>, ...keys: string[]) {
  const map = new Map(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9.]/g, ""),
      value,
    ])
  );
  for (const key of keys) {
    const value = map.get(key.toLowerCase().replace(/[^a-z0-9.]/g, ""));
    if (value !== undefined && String(value).trim() !== "")
      return String(value).trim();
  }
  return "";
}

/**
 * Derive a student's programme and level from the registration number
 * (e.g. 2022/ICT/114) and the current academic year (e.g. 2025/2026).
 */
export function deriveStudentCohort(input: {
  registrationNo?: string;
  email?: string;
  department?: string;
  yearOfStudy?: string;
  level?: string;
  program?: string;
  currentAcademicYear?: string;
}): {
  program: "IT" | "AMC" | null;
  level: number | null;
  intakeYear: number | null;
} {
  const reg = String(input.registrationNo || "").toLowerCase();
  const email = String(input.email || "").toLowerCase();
  const dept = `${input.program || ""} ${input.department || ""}`.toLowerCase();
  let program: "IT" | "AMC" | null = null;
  const programSource = `${dept} ${reg} ${email.split("@")[0]}`;
  if (/\bamc\b|amc|applied|math|\bcs\b|\/cs\/|\d{4}cs\d/.test(programSource))
    program = "AMC";
  if (/\bit\b|ict|information|\/it\/|\d{4}it\d|\d{4}ict\d/.test(programSource))
    program = "IT";
  if (normalizeProgram(input.program) === "AMC") program = "AMC";
  if (normalizeProgram(input.program) === "IT") program = "IT";
  const explicitLevel =
    levelNumber(input.level) ??
    (/(st|nd|rd|th)\s*year|level|^\s*[1-4]\s*$/i.test(
      String(input.yearOfStudy || "")
    )
      ? levelNumber(input.yearOfStudy)
      : null);
  const intakeMatch =
    reg.match(/(20\d{2})/) ||
    email.match(/^(20\d{2})/) ||
    String(input.yearOfStudy || "").match(/(20\d{2})\s*\/\s*20\d{2}/);
  const intakeYear = intakeMatch ? Number(intakeMatch[1]) : null;
  let level = explicitLevel;
  if (!level && intakeYear) {
    const current = Number(
      String(input.currentAcademicYear || "").match(/(20\d{2})/)?.[1] ||
        new Date().getFullYear()
    );
    // Registration year denotes the academic year in which Level 1 began.
    // With the 2025/2026 academic year, 2022 -> Level 3 and 2023 -> Level 2.
    const derived = current - intakeYear;
    level = Math.min(4, Math.max(1, derived));
  }
  return { program, level: level ?? null, intakeYear };
}
