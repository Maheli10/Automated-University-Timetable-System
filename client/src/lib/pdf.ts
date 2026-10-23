import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DAYS,
  DEFAULT_PERIODS,
  overlaps,
  sortSessions,
  toMinutes,
  type AnalyticsData,
  type SessionRow,
} from "./uov";

const BLUE: [number, number, number] = [29, 78, 216];
const INK: [number, number, number] = [15, 27, 45];
const MUTED: [number, number, number] = [91, 107, 130];

let logoCache: string | null = null;
async function logo() {
  if (logoCache) return logoCache;
  try {
    const blob = await (await fetch("/assets/uov-logo.png")).blob();
    logoCache = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

async function header(doc: jsPDF, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  const image = await logo();
  if (image) doc.addImage(image, "PNG", 12, 8, 64, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BLUE);
  doc.text(title, width - 12, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, width - 12, 20, { align: "right" });
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(12, 28, width - 12, 28);
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `University of Vavuniya · Faculty of Applied Science · Generated ${new Date().toLocaleString()}`,
      12,
      height - 6
    );
    doc.text(`Page ${i} of ${pages}`, width - 12, height - 6, {
      align: "right",
    });
  }
}

/** A4 landscape weekly timetable grid (practicals span two periods). */
export async function exportTimetablePdf(opts: {
  title: string;
  subtitle: string;
  sessions: SessionRow[];
  filename: string;
  periods?: { start: string; end: string }[];
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await header(doc, opts.title, opts.subtitle);
  const periods = opts.periods?.length ? opts.periods : DEFAULT_PERIODS;
  const active = opts.sessions.filter(s => s.status !== "cancelled");
  const consumed = new Set<string>();
  const body: any[] = [];
  periods.forEach((period, index) => {
    const prev = periods[index - 1];
    if (prev && toMinutes(period.start) > toMinutes(prev.end)) {
      const label =
        toMinutes(prev.end) >= toMinutes("12:00") &&
        toMinutes(period.start) <= toMinutes("14:00")
          ? "LUNCH BREAK"
          : "BREAK";
      body.push([
        {
          content: `${prev.end}–${period.start}`,
          styles: { fontSize: 7, textColor: MUTED },
        },
        {
          content: label,
          colSpan: 5,
          styles: {
            halign: "center",
            fillColor: [241, 245, 251],
            textColor: MUTED,
            fontSize: 7,
            fontStyle: "bold",
          },
        },
      ]);
    }
    const row: any[] = [
      {
        content: `${period.start}\n${period.end}`,
        styles: { fontStyle: "bold", textColor: BLUE, fontSize: 8 },
      },
    ];
    for (const day of DAYS) {
      if (consumed.has(`${day}-${index}`)) continue;
      const starting = active.filter(
        s =>
          s.day === day &&
          overlaps(s.startTime, s.endTime, period.start, period.end) &&
          !(
            index > 0 &&
            overlaps(
              s.startTime,
              s.endTime,
              periods[index - 1].start,
              periods[index - 1].end
            )
          )
      );
      if (!starting.length) {
        row.push("");
        continue;
      }
      let span = 1;
      for (let j = index + 1; j < periods.length; j++) {
        if (
          starting.some(s =>
            overlaps(s.startTime, s.endTime, periods[j].start, periods[j].end)
          ) &&
          toMinutes(periods[j].start) - toMinutes(periods[j - 1].end) < 10
        ) {
          span++;
          consumed.add(`${day}-${j}`);
        } else break;
      }
      const text = starting
        .map(
          s =>
            `${s.subjectCode}${s.classType === "Practical" ? " (P)" : ""}\n${s.room?.code || "Room TBA"} · ${s.staff.map(p => p.name.replace(/^(Mr|Ms|Mrs|Dr|Prof)\.?\s*/i, "")).join(", ") || "TBA"}${starting.length === 1 ? `\n${s.batch}` : ""}`
        )
        .join("\n— — —\n");
      row.push({
        content: text,
        rowSpan: span,
        styles: {
          fillColor: starting.some(s => s.classType === "Practical")
            ? [253, 244, 220]
            : [234, 241, 255],
        },
      });
    }
    body.push(row);
  });
  autoTable(doc, {
    startY: 32,
    head: [["Time", ...DAYS]],
    body,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      valign: "middle",
      textColor: INK,
      lineColor: [213, 222, 235],
      lineWidth: 0.15,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: BLUE,
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: { 0: { cellWidth: 18, halign: "center" } },
    margin: { left: 12, right: 12 },
  });
  const list = sortSessions(active);
  if (list.length) {
    doc.addPage();
    await header(doc, `${opts.title} — session list`, opts.subtitle);
    autoTable(doc, {
      startY: 32,
      head: [
        ["Day", "Time", "Code", "Course", "Type", "Cohort", "Lecturer", "Room"],
      ],
      body: list.map(s => [
        s.day,
        `${s.startTime}–${s.endTime}`,
        s.subjectCode,
        s.subjectName,
        s.classType,
        s.batch,
        s.staff.map(p => p.name).join(", ") || "TBA",
        s.room ? `${s.room.code} · ${s.room.name}` : "TBA",
      ]),
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: INK },
      headStyles: { fillColor: BLUE, textColor: 255 },
      alternateRowStyles: { fillColor: [245, 248, 253] },
      margin: { left: 12, right: 12 },
    });
  }
  footer(doc);
  doc.save(opts.filename);
}

function section(
  doc: jsPDF,
  title: string,
  head: string[],
  body: (string | number)[][],
  note?: string
) {
  const last = (doc as any).lastAutoTable?.finalY ?? 30;
  let y = last + 10;
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BLUE);
  doc.text(title, 12, y);
  if (note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(note, 12, y + 4.5);
  }
  autoTable(doc, {
    startY: y + (note ? 7 : 3),
    head: [head],
    body: body.length
      ? body
      : [
          [
            {
              content: "No records",
              colSpan: head.length,
              styles: { halign: "center", textColor: MUTED },
            } as any,
          ],
        ],
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    margin: { left: 12, right: 12 },
  });
}

export async function exportAnalyticsPdf(
  data: AnalyticsData,
  sections: string[] = ["all"]
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const want = (key: string) =>
    sections.includes("all") || sections.includes(key);
  await header(
    doc,
    "Timetable Analytics Report",
    `${data.academicYear} · Semester ${data.semester}`
  );
  const s = data.summary;
  (doc as any).lastAutoTable = { finalY: 26 };
  section(
    doc,
    "Summary",
    ["Metric", "Value", "Metric", "Value"],
    [
      ["Courses this semester", s.courses, "Weekly sessions", s.sessions],
      [
        "Weekly teaching hours",
        `${s.weeklyHours} / ${s.requiredHours} required`,
        "Coverage",
        `${s.coverage}%`,
      ],
      [
        "Active lecturers",
        `${s.activeLecturers} of ${s.lecturers}`,
        "Rooms",
        s.rooms,
      ],
      [
        "Average room utilisation",
        `${s.roomUtilization}%`,
        "Lecturer balance score",
        `${s.lecturerBalance}/100`,
      ],
      ["Timetable clashes", s.conflicts, "Warnings", s.warnings],
      [
        "Unscheduled courses",
        s.unscheduledCourses,
        "Students with accounts",
        s.students,
      ],
    ]
  );
  if (want("batches"))
    section(
      doc,
      "Weekly workload per student batch",
      [
        "Batch",
        "Students",
        "Courses",
        "Sessions",
        "Hours",
        "Theory",
        "Practical",
        "Free periods",
        "Busiest day",
      ],
      data.batches
        .filter(b => b.declaredCourses || b.sessions)
        .map(b => [
          b.label,
          b.students,
          b.courses,
          b.sessions,
          b.hours,
          b.theoryHours,
          b.practicalHours,
          b.freePeriods,
          b.busiestDay,
        ])
    );
  if (want("lecturers"))
    section(
      doc,
      "Lecturer teaching workload",
      [
        "Lecturer",
        "Sessions",
        "Hours",
        "Theory",
        "Practical",
        "Free periods",
        "Load",
        "Status",
      ],
      data.lecturers.map(l => [
        l.name,
        l.sessions,
        l.hours,
        l.theoryHours,
        l.practicalHours,
        l.freePeriods,
        `${l.loadPct}%`,
        l.flag,
      ]),
      `Mean ${data.lecturerBalance.mean} h/week · std. dev. ${data.lecturerBalance.stdDev} · range ${data.lecturerBalance.min}–${data.lecturerBalance.max} h · balance score ${data.lecturerBalance.balanceScore}/100`
    );
  if (want("rooms"))
    section(
      doc,
      "Lecture hall and laboratory utilisation",
      [
        "Room",
        "Type",
        "Capacity",
        "Sessions",
        "Hours",
        "Utilisation",
        "Avg. fill",
        "Free periods",
      ],
      data.rooms.map(r => [
        `${r.code} · ${r.name}`,
        r.kind,
        r.capacity,
        r.sessions,
        r.hours,
        `${r.utilization}%`,
        `${r.avgFill}%`,
        r.freePeriods,
      ])
    );
  if (want("programs"))
    section(
      doc,
      "Department / programme course statistics",
      [
        "Programme",
        "Courses (all)",
        "This semester",
        "Core",
        "Electives",
        "Credits",
        "Theory h",
        "Practical h",
        "With lecturer",
      ],
      data.programs.map(p => [
        p.program,
        p.courses,
        p.semesterCourses,
        p.core,
        p.electives,
        p.credits,
        p.theoryHours,
        p.practicalHours,
        p.withLecturer,
      ])
    );
  if (want("students"))
    section(
      doc,
      "IT and AMC student statistics",
      ["Level", "IT", "AMC", "Total"],
      [
        ...data.students.byLevel.map(l => [
          `Level ${l.level}`,
          l.IT,
          l.AMC,
          l.IT + l.AMC,
        ]),
        [
          "All levels",
          data.students.it,
          data.students.amc,
          data.students.total,
        ],
      ]
    );
  if (want("conflicts"))
    section(
      doc,
      "Timetable conflict summary",
      ["Type", "Severity", "Details"],
      data.conflicts.slice(0, 200).map(c => [c.type, c.severity, c.message])
    );
  if (want("unscheduled"))
    section(
      doc,
      "Unscheduled session report",
      [
        "Code",
        "Course",
        "Cohort",
        "Required h",
        "Scheduled h",
        "Missing",
        "Reason",
      ],
      data.unscheduled.map(u => [
        u.code,
        u.name,
        u.cohort,
        u.requiredHours,
        u.scheduledHours,
        `${u.missingTheory}T + ${u.missingPractical}P`,
        u.reason,
      ])
    );
  if (want("free"))
    section(
      doc,
      "Batch-wise free periods",
      ["Batch", ...DAYS],
      data.batches
        .filter(b => b.declaredCourses || b.sessions)
        .map(b => [
          b.label,
          ...DAYS.map(d => String((b.freeByDay as any)[d]?.length ?? 0)),
        ])
    );
  if (want("generation") && data.generation) {
    const g = data.generation;
    section(
      doc,
      "Semester timetable generation summary",
      [
        "Run",
        "Date",
        "Sessions placed",
        "Unplaced",
        "Required hours",
        "Scheduled hours",
        "Runtime",
      ],
      [
        [
          `#${g.id}`,
          new Date(g.createdAt as any).toLocaleString(),
          g.scheduled,
          g.unscheduled,
          g.stats?.requiredHours ?? "—",
          g.stats?.scheduledHours ?? "—",
          g.stats ? `${g.stats.runtimeMs} ms` : "—",
        ],
      ]
    );
  }
  footer(doc);
  doc.save(`uov-timetable-analytics-S${data.semester}.pdf`);
}
