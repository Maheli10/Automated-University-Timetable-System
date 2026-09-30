/**
 * constraints.js – Constraint policy & time validation
 * Working hours, breaks, fixed lecture/practical slots, blocked periods, daily limits.
 * Contains no room / staff data, so it can be understood and tested on its own.
 */

const policy = {
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
  lectureSlots: [ // fixed 55-minute UOV lecture periods
    ["08:30", "09:25"], ["09:25", "10:20"],
    ["10:40", "11:35"], ["11:35", "12:30"],
    ["13:30", "14:25"], ["14:25", "15:20"],
    ["15:40", "16:35"],
  ],
  blockedPeriods: [
    { day: "Wednesday", start: "13:30", end: "16:35", label: "Faculty staff meeting" },
  ],
  maxBatchClassesPerDay: 5,
  maxBatchPracticalsPerDay: 2,
  preventSameSubjectSameDay: true,
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const overlaps = (a1, a2, b1, b2) => mins(a1) < mins(b2) && mins(a2) > mins(b1);
const within = (s, e, os, oe) => mins(s) >= mins(os) && mins(e) <= mins(oe);

function validateTime({ day, startTime, endTime, classType }) {
  const issues = [];
  if (mins(startTime) >= mins(endTime)) issues.push("End time must be after start time");
  if (!within(startTime, endTime, policy.workingHours.start, policy.workingHours.end))
    issues.push(`Outside working hours (${policy.workingHours.start}–${policy.workingHours.end})`);
  const brk = policy.breaks.find(b => overlaps(startTime, endTime, b.start, b.end));
  if (brk) issues.push(`Overlaps ${brk.label}`);
  if (classType === "Practical" && !policy.practicalSlots.some(p => p.start === startTime && p.end === endTime))
    issues.push("Practicals must use one complete practical slot");
  const blk = policy.blockedPeriods.find(b => b.day === day && overlaps(startTime, endTime, b.start, b.end));
  if (blk) issues.push(`Overlaps blocked period: ${blk.label}`);
  return issues;
}

function candidateSlots(classType) {
  if (classType === "Practical") return policy.practicalSlots.map(p => [p.start, p.end]);
  return policy.lectureSlots.filter(([s, e]) => !policy.breaks.some(b => overlaps(s, e, b.start, b.end)));
}

module.exports = { policy, DAYS, mins, overlaps, within, validateTime, candidateSlots };
