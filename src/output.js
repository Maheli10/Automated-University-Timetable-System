/**
 * output.js – Console printing helpers
 * Formats timetables for the terminal.
 */

const { DAYS, mins } = require("./constraints");
const { rooms, staff } = require("./data");

const roomName = id => rooms.find(r => r.id === id)?.name ?? "-";
const staffName = ids => ids.map(i => staff.find(s => s.id === i)?.name).join(", ");
const line = (c = "─", n = 78) => c.repeat(n);
const pad = (s, n) => String(s).padEnd(n);

function printTimetable(title, sessions) {
  console.log(`\n${line("═")}\n  ${title}\n${line("═")}`);
  if (!sessions.length) return console.log("  (no sessions)");
  for (const day of DAYS) {
    const rows = sessions.filter(s => s.day === day).sort((a, b) => mins(a.startTime) - mins(b.startTime));
    if (!rows.length) continue;
    console.log(`\n  ${day}`);
    for (const s of rows)
      console.log(`    ${s.startTime}–${s.endTime}  ${pad(s.subjectCode, 7)} ${pad(s.subjectName, 20)} ${pad(s.classType, 9)} ${pad(s.batch, 6)} ${pad(roomName(s.roomId), 9)} ${staffName(s.staffIds)}`);
  }
}

module.exports = { roomName, staffName, line, pad, printTimetable };
