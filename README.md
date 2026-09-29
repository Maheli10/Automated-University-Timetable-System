# UOV Timetable – Prototype

> This branch contains the backend prototype and the UI design. 

 **[View the UI Design on Figma](# Figma Prototype

This document contains the Figma prototype for the **Automated University Timetable System**.

## Prototype Link

[View the UOV Timetable Figma Prototype](https://www.figma.com/make/e3tbvJiYPRd2YuUb3iQ4Se/UOV-Time-Table?t=w2PEIjsqih307V0W-20&fullscreen=1)

## Description

The Figma prototype demonstrates the proposed user interface, navigation, and main workflows of the **Automated University Timetable System**.

It provides a visual representation of the system before the implementation of the final application.)** · Source file: [`design/UOV-Timetable.fig`](design/UOV-Timetable.fig)


## What it demonstrates
1. **Time validation** – working hours, breaks, fixed practical slots, blocked events
2. **Automatic weekly timetable generation** – lecturer, room, batch, workload and availability rules
3. **Manual booking conflict detection** – room / lecturer / batch overlap, capacity, maintenance, room suitability
4. **Workload summary** – per lecturer and per room

## Project structure
```
src/
├── constraints.js   Policy (hours, breaks, slots) + time validation
├── data.js          Sample rooms, staff and weekly requests
├── conflicts.js     Manual booking conflict detection
├── generator.js     Automatic weekly generator
├── output.js        Timetable printing helpers
└── index.js         Entry point: demo + command-line options
```

## How to run
Requires **Node.js 18 or newer** (check with `node -v`).

```
npm start                          # full demo
node src/index.js --json           # generated plan as JSON
node src/index.js --batch Y3-S1    # one batch's timetable
node src/index.js --lecturer L01   # one lecturer's timetable
node src/index.js --room LH-1      # one room's timetable
```

**Expected output:** 
3 of 4 time checks rejected; 11 sessions placed with 1 warning (`XX9999` has no lecturer, on purpose); 6 of 7 manual bookings rejected with reasons; workload per lecturer and room.

To try other scenarios, edit the sample data in `src/data.js` (rooms, staff, requests) or the rules in `src/constraints.js`, then run again.

## Team & work division

**Member 1- Parami/2022ICT41:**
- Files: `src/generator.js`, `src/index.js`, `README.md`, `package.json`
- Responsibility: automatic generator, demo runner and command-line options, documentation
**UI design**
- Files: Figma link, `design/`
- Responsibility: UI design of the system


**Member 2 – (name)**
- Files: `src/constraints.js`, `src/output.js`
- Responsibility: constraint policy, time validation, timetable printing

**Member 3 – (name)**
- Files: `src/data.js`, `src/conflicts.js`
- Responsibility: sample data, booking conflict detection

## Limitation
No database, login, roles, notifications or approval flow. The generator is greedy (first fit), and each subject has one lecturer.
