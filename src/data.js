/**
 * data.js – Sample data (in-memory "database")
 * Rooms, lecturers (staff) and the weekly teaching requests.
 * Edit this file to try different scenarios.
 */

const rooms = [
  { id: 1, name: "LH-1", type: "Lecture Hall", capacity: 120, status: "available", equipment: "projector" },
  { id: 2, name: "LH-2", type: "Lecture Hall", capacity: 60,  status: "available", equipment: "projector" },
  { id: 3, name: "LH-3", type: "Lecture Hall", capacity: 80,  status: "maintenance", equipment: "projector" },
  { id: 4, name: "CS-Lab-1", type: "Computer Laboratory", capacity: 40, status: "available", equipment: "computers,projector" },
  { id: 5, name: "Phy-Lab", type: "Physics Laboratory", capacity: 30, status: "available", equipment: "lab benches" },
];

const staff = [
  { id: 1, code: "L01", name: "Dr. Perera",   expertise: "CS3101,CS3102", maxDailyMinutes: 240, maxWeeklyMinutes: 900, availability: "Friday 13:30-16:35" },
  { id: 2, code: "L02", name: "Ms. Fernando", expertise: "CS3103,CS3104", maxDailyMinutes: 240, maxWeeklyMinutes: 900, availability: "" },
  { id: 3, code: "L03", name: "Dr. Kumar",    expertise: "MA3101,PH3101", maxDailyMinutes: 200, maxWeeklyMinutes: 700, availability: "Monday 08:30-10:20" },
];

// What must be taught each week (like the "generateWeek" request in the real API)
const requests = [
  { subjectCode: "CS3101", subjectName: "Algorithms",         batch: "Y3-S1", classType: "Theory",    participantCount: 55, weeklyHours: 3 },
  { subjectCode: "CS3102", subjectName: "Algorithms Lab",     batch: "Y3-S1", classType: "Practical", participantCount: 35, weeklyHours: 2 },
  { subjectCode: "CS3103", subjectName: "Databases",          batch: "Y3-S1", classType: "Theory",    participantCount: 55, weeklyHours: 2 },
  { subjectCode: "CS3104", subjectName: "Databases Lab",      batch: "Y3-S1", classType: "Practical", participantCount: 35, weeklyHours: 2 },
  { subjectCode: "MA3101", subjectName: "Numerical Methods",  batch: "Y3-S1", classType: "Theory",    participantCount: 55, weeklyHours: 2 },
  { subjectCode: "PH3101", subjectName: "Applied Physics",    batch: "Y3-S2", classType: "Theory",    participantCount: 50, weeklyHours: 2 },
  { subjectCode: "XX9999", subjectName: "Unmapped Subject",   batch: "Y3-S2", classType: "Theory",    participantCount: 40, weeklyHours: 1 }, // no lecturer -> reported as conflict
];

module.exports = { rooms, staff, requests };
