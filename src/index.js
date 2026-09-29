#!/usr/bin/env node
/**
 * UOV Automated Timetable – BACKEND PROTOTYPE (no frontend, no database, no dependencies)
 *
 * index.js – entry point: runs the demo and handles command-line options.
 *
 * Usage:
 *   node src/index.js            -> runs the full demo (validation, conflicts, generation, timetables)
 *   node src/index.js --json     -> prints the generated plan as JSON
 *   node src/index.js --batch Y3-S1     -> print only one batch's timetable
 *   node src/index.js --lecturer L01    -> print only one lecturer's timetable
 *   node src/index.js --room LH-1       -> print only one room's timetable
 */
const { validateTime } = require("./constraints");
const { rooms, staff, requests } = require("./data");
const { checkConflicts } = require("./conflicts");
const { generateWeek } = require("./generator");
const { pad, line, printTimetable } = require("./output");

const arg = f => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };

function main() {
  const { plan, conflicts } = generateWeek(requests);

  if (process.argv.includes("--json")) {
    return console.log(JSON.stringify({ plan, conflicts }, null, 2));
  }
  const b = arg("--batch"), l = arg("--lecturer"), r = arg("--room");
  if (b || l || r) {
    let rows = plan;
    if (b) rows = rows.filter(s => s.batch === b);
    if (l) { const id = staff.find(s => s.code === l)?.id; rows = rows.filter(s => s.staffIds.includes(id)); }
    if (r) { const id = rooms.find(x => x.name === r)?.id; rows = rows.filter(s => s.roomId === id); }
    return printTimetable(`Filtered timetable (${[b && "batch " + b, l && "lecturer " + l, r && "room " + r].filter(Boolean).join(", ")})`, rows);
  }

  console.log(line("█"));
  console.log("  UOV AUTOMATED TIMETABLE SYSTEM – BACKEND PROTOTYPE");
  console.log(line("█"));

  // DEMO 1 – time-constraint validation
  console.log("\n[1] TIME CONSTRAINT VALIDATION");
  const tests = [
    { label: "Theory during lunch",            day: "Monday",    startTime: "12:00", endTime: "13:00", classType: "Theory" },
    { label: "Practical not in a full slot",   day: "Monday",    startTime: "09:30", endTime: "11:30", classType: "Practical" },
    { label: "Class in Wed staff meeting",     day: "Wednesday", startTime: "14:25", endTime: "15:20", classType: "Theory" },
    { label: "Valid lecture",                  day: "Tuesday",   startTime: "08:30", endTime: "09:25", classType: "Theory" },
  ];
  for (const t of tests) {
    const issues = validateTime(t);
    console.log(`  ${issues.length ? "✗" : "✓"} ${pad(t.label, 32)} ${issues.length ? issues.join("; ") : "OK"}`);
  }

  // DEMO 2 – automatic generation
  console.log("\n[2] AUTOMATIC WEEKLY GENERATION");
  console.log(`  Requests: ${requests.length}   Sessions placed: ${plan.length}   Unresolved: ${conflicts.length}`);
  conflicts.forEach(c => console.log(`  ⚠ ${c}`));

  printTimetable("BATCH Y3-S1 TIMETABLE", plan.filter(s => s.batch === "Y3-S1"));
  printTimetable("BATCH Y3-S2 TIMETABLE", plan.filter(s => s.batch === "Y3-S2"));

  // DEMO 3 – manual booking conflict detection against the generated plan
  console.log(`\n${line("═")}\n[3] MANUAL BOOKING CONFLICT DETECTION\n${line("═")}`);
  const first = plan[0];
  const attempts = [
    { label: "Same room + time as an existing session", ...first, subjectCode: "NEW101", batch: "Y1-S1", staffIds: [2] },
    { label: "Same batch, same time",                    ...first, subjectCode: "NEW102", roomId: 2, staffIds: [2] },
    { label: "Same lecturer, same time",                 ...first, subjectCode: "NEW103", batch: "Y1-S1", roomId: 2 },
    { label: "Room under maintenance",  day: "Friday", startTime: "08:30", endTime: "09:25", classType: "Theory", batch: "Y2-S1", subjectCode: "NEW104", participantCount: 40, roomId: 3, staffIds: [2] },
    { label: "Room too small (60 seats < 100)", day: "Friday", startTime: "08:30", endTime: "09:25", classType: "Theory", batch: "Y2-S1", subjectCode: "NEW105", participantCount: 100, roomId: 2, staffIds: [2] },
    { label: "Lecture in a lab",         day: "Friday", startTime: "08:30", endTime: "09:25", classType: "Theory", batch: "Y2-S1", subjectCode: "NEW106", participantCount: 20, roomId: 4, staffIds: [2] },
    { label: "Clean booking",            day: "Friday", startTime: "10:40", endTime: "11:35", classType: "Theory", batch: "Y2-S1", subjectCode: "NEW107", participantCount: 40, roomId: 1, staffIds: [2] },
  ];
  for (const a of attempts) {
    const issues = checkConflicts(a, plan);
    console.log(`  ${issues.length ? "✗ REJECTED" : "✓ ACCEPTED"}  ${a.label}`);
    issues.forEach(i => console.log(`       - ${i}`));
  }

  // Summary
  console.log(`\n${line("═")}\n[4] LECTURER WORKLOAD & ROOM UTILISATION\n${line("═")}`);
  for (const p of staff) {
    const total = plan.filter(s => s.staffIds.includes(p.id)).reduce((n, s) => n + s.durationMinutes, 0);
    console.log(`  ${pad(p.name, 14)} ${pad(total + " min", 9)} of ${p.maxWeeklyMinutes} weekly limit`);
  }
  for (const rm of rooms) {
    const n = plan.filter(s => s.roomId === rm.id).length;
    console.log(`  ${pad(rm.name, 14)} ${n} session(s)   [${rm.status}]`);
  }
  console.log("\nTip: node prototype.js --json | --batch Y3-S1 | --lecturer L01 | --room LH-1\n");
}

main();
