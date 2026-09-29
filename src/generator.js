/**
 * generator.js – Automatic weekly timetable generator
 * Greedy search over day + slot + room + lecturer, respecting every rule
 * from constraints.js and conflicts.js.
 */

const { policy, DAYS, mins, overlaps, validateTime, candidateSlots } = require("./constraints");
const { rooms, staff } = require("./data");
const { roomSuitable } = require("./conflicts");

const availabilityBlocked = (text, day, s, e) =>
  (text || "").split(/[;,]/).some(v => {
    const m = v.trim().match(/^(\w+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    return m && m[1].toLowerCase() === day.toLowerCase() && overlaps(s, e, m[2], m[3]);
  });

function generateWeek(reqs) {
  const plan = [], conflicts = [];

  for (const req of reqs) {
    // pick lecturer by subject expertise, least-loaded first
    const eligible = staff.filter(p => p.expertise.includes(req.subjectCode))
      .sort((a, b) => a.maxWeeklyMinutes - b.maxWeeklyMinutes);
    if (!eligible.length) { conflicts.push(`${req.subjectCode}/${req.batch}: no eligible lecturer mapped to this subject`); continue; }
    const lecturer = eligible[0];

    const needed = req.classType === "Practical" ? Math.max(1, Math.ceil(req.weeklyHours / 2)) : Math.ceil(req.weeklyHours);
    let placed = 0;

    for (let i = 0; i < needed; i++) {
      let found = null;
      for (const day of DAYS) {
        for (const [start, end] of candidateSlots(req.classType)) {
          if (validateTime({ day, startTime: start, endTime: end, classType: req.classType }).length) continue;
          if (availabilityBlocked(lecturer.availability, day, start, end)) continue;

          // lecturer workload
          const mine = plan.filter(p => p.staffIds.includes(lecturer.id));
          const dur = mins(end) - mins(start);
          const daily = mine.filter(p => p.day === day).reduce((n, p) => n + p.durationMinutes, 0);
          const weekly = mine.reduce((n, p) => n + p.durationMinutes, 0);
          if (daily + dur > lecturer.maxDailyMinutes || weekly + dur > lecturer.maxWeeklyMinutes) continue;

          // batch daily rules
          const sameDay = plan.filter(p => p.day === day && p.batch === req.batch);
          if (sameDay.length >= policy.maxBatchClassesPerDay) continue;
          if (req.classType === "Practical" && sameDay.filter(p => p.classType === "Practical").length >= policy.maxBatchPracticalsPerDay) continue;
          if (policy.preventSameSubjectSameDay && sameDay.some(p => p.subjectCode === req.subjectCode)) continue;

          // clashes
          const clash = plan.some(p => p.day === day && overlaps(start, end, p.startTime, p.endTime) &&
            (p.batch === req.batch || p.staffIds.includes(lecturer.id)));
          if (clash) continue;

          // room: available, big enough, right type, free
          const room = rooms.find(r => r.status === "available" && r.capacity >= req.participantCount && roomSuitable(r, req) &&
            !plan.some(p => p.roomId === r.id && p.day === day && overlaps(start, end, p.startTime, p.endTime)));
          if (room) { found = { day, startTime: start, endTime: end, roomId: room.id }; break; }
        }
        if (found) break;
      }
      if (!found) { conflicts.push(`${req.subjectCode}/${req.batch}: session ${i + 1} could not be placed`); continue; }
      plan.push({ ...req, ...found, durationMinutes: mins(found.endTime) - mins(found.startTime), staffIds: [lecturer.id], status: "scheduled" });
      placed++;
    }
  }
  return { plan, conflicts };
}

module.exports = { availabilityBlocked, generateWeek };
