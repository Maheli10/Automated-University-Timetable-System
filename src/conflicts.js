/**
 * conflicts.js – Manual booking conflict detection
 * Room / lecturer / batch overlap, capacity, maintenance, room suitability.
 */

const { policy, overlaps, validateTime } = require("./constraints");
const { rooms } = require("./data");

function roomSuitable(room, session) {
  const t = room.type.toLowerCase();
  return session.classType === "Practical" ? t.includes("lab") : t.includes("lecture hall");
}

/** Manual-save check: returns a list of human-readable issues (empty = OK). */
function checkConflicts(input, existing) {
  const issues = [...validateTime(input)];
  const active = existing.filter(s => s.status !== "cancelled" && s.day === input.day &&
    overlaps(input.startTime, input.endTime, s.startTime, s.endTime));
  const sameDayBatch = existing.filter(s => s.status !== "cancelled" && s.day === input.day && s.batch === input.batch);

  if (sameDayBatch.length >= policy.maxBatchClassesPerDay) issues.push(`Batch already has ${policy.maxBatchClassesPerDay} classes on ${input.day}`);
  if (input.classType === "Practical" && sameDayBatch.filter(s => s.classType === "Practical").length >= policy.maxBatchPracticalsPerDay)
    issues.push(`Batch already has max practicals on ${input.day}`);
  if (policy.preventSameSubjectSameDay && sameDayBatch.some(s => s.subjectCode === input.subjectCode))
    issues.push("Same subject already scheduled for this batch on this day");

  for (const s of active) {
    if (input.roomId && s.roomId === input.roomId) issues.push(`Room overlap with ${s.subjectCode} (${s.startTime}–${s.endTime})`);
    if (s.batch === input.batch) issues.push(`Batch overlap with ${s.subjectCode}`);
    if ((input.staffIds || []).some(id => (s.staffIds || []).includes(id))) issues.push(`Lecturer overlap with ${s.subjectCode}`);
  }
  const room = rooms.find(r => r.id === input.roomId);
  if (room) {
    if (room.status === "maintenance") issues.push(`${room.name} is under maintenance`);
    if (room.capacity < input.participantCount) issues.push(`${room.name} has ${room.capacity} seats for ${input.participantCount} students`);
    if (!roomSuitable(room, input)) issues.push(`${room.name} is not suitable for ${input.classType}`);
  }
  return issues;
}

module.exports = { roomSuitable, checkConflicts };
