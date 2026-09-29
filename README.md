# UOV Automated University Timetable System

A full-stack timetable administration workspace for the Faculty of Applied Science at the University of Vavuniya. The application combines a responsive university admin dashboard with persistent relational records for staff, teaching spaces, sessions, and staff assignments.

## What is implemented

The dashboard opens directly on a Monday–Friday weekly timetable with a white and maroon visual system. Sessions are displayed by actual start and end times, remain visible when cancelled, and can be filtered by subject, staff, room, batch, and class type. Session cards expose details such as subject, staff contact, room, participants, duration, schedule type, and status. Browser print and PDF export are available through the print dialog.

The session workflow calculates duration from the selected interval and submits through a typed API that checks partial overlaps, not merely matching start times. It blocks room, staff, batch/group, capacity, maintenance, and suitability conflicts with readable messages. Cancelled sessions are excluded from active booking checks so their rooms become available again. Available Places ranks suitable rooms by capacity fit and facilities, while staff, room, staff-schedule, and room-schedule views provide responsive administration surfaces.

The scheduling engine now applies a configurable university constraint policy to both manual saves and automatic generation. The default policy protects 08:30–16:30 working hours, the 10:20–10:40 official break, the 12:30–13:30 lunch break, fixed practical slots, blocked university events, maximum daily batch classes, maximum daily practical sessions, and unnecessary same-subject repeats on one day. It also continues to enforce lecturer availability, lecturer daily/weekly workload, room capacity, room suitability, batch clashes, lecturer clashes, and room clashes.

Administrators can open **Content & Notifications → University constraint policy** and edit the JSON policy. This provides an extension point for future university rules such as ceremonies, examinations, faculty meetings, semester-specific blocked periods, department working hours, and custom rule metadata without changing the timetable screens. The policy is stored in `app_settings` under `constraintPolicy`, and the generator reads it on each run.

## Technology

The project uses React 19, TypeScript, Tailwind CSS 4, Vite, Express, tRPC, Drizzle ORM, and a MySQL-compatible relational database provided through `DATABASE_URL`. Authentication infrastructure is supplied by the project template. The schema and migration SQL live under `drizzle/`; server procedures are defined in `server/routers.ts` and consumed through the typed client.

## Local setup

```bash
pnpm install
pnpm dev
```

For a local teacher presentation without university OAuth credentials, use the explicit local-only demo mode:

```bash
pnpm demo
```

Then open `http://localhost:3000/` and choose **Open local demo**. Normal `pnpm dev` remains OAuth-based; `pnpm demo` is the only command that enables the local demo session.

The required environment is supplied by the Manus project runtime. For an external local database, set `DATABASE_URL` to a MySQL-compatible connection string and keep the existing authentication variables configured by the scaffold. Apply the generated migration with the project database workflow before using persistent create and update operations.

## Quality checks

```bash
pnpm check
pnpm test
pnpm build
```

The test suite covers authentication logout behavior, partial-overlap detection, back-to-back sessions, protected breaks, practical-slot enforcement, and blocked university periods. The application deliberately keeps timetable rendering usable when a database has no records yet, while all create and update mutations require the configured persistent database.

## Key routes and procedures

The UI routes are `/`, `/sessions`, `/rooms`, `/staff`, `/staff-schedules`, and `/room-schedules`. The server exposes typed procedures for listing, creating, and updating staff and rooms; listing, creating, updating, and cancelling sessions; validating conflicts; checking availability; and retrieving staff assignments. Because procedures are typed end to end, the UI receives validation errors without custom request wrappers.

## Operational notes

The current preview includes representative timetable content so the primary experience is visible immediately. Production records are stored through the Drizzle schema rather than embedded in the UI. The optional administrator-notification hook is represented as a natural extension point around cancellation, rescheduling, and rejected conflict mutations; wiring a specific notification provider requires the administrator's preferred channel and credentials.
