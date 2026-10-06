# Automated University Timetable Management System

A web-based system for managing and generating university timetables while detecting scheduling conflicts. The system supports students, lecturers, staff, and administrators in managing academic scheduling more efficiently.

## Project Status

🚧 **Under Development**

The team is working on the database management phase. This phase covers the shared database foundation, schema verification, safe import fixtures, testing, and final integration. Frontend and feature-specific backend development are handled separately.

Final database verification is **Pending**. This document does not confirm that setup or testing has passed.

## Main Technologies

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, TypeScript, tRPC
- **Database:** MySQL
- **ORM:** Drizzle ORM
- **Package Manager:** pnpm

## Repository Structure

```text
uov-timetable-work/
├── client/           # Frontend application
├── server/           # Backend, database connection and setup
├── shared/           # Shared types and utilities
├── drizzle/          # Database schema and relations
├── database/         # Database setup SQL
├── docs/             # Project documentation
├── README.md         # Project overview and team workflow
├── LOCAL_SETUP.md    # Local database setup and verification
├── drizzle.config.ts
├── package.json
└── pnpm-lock.yaml
```

## Database Management Phase

The shared database schema covers:

| Area | Tables |
| --- | --- |
| Users and academic resources | `users`, `staff`, `rooms`, `courses` |
| Teaching assignments | `course_lecturers` |
| Scheduled sessions | `sessions`, `session_staff`, `session_exceptions` |
| Settings and notices | `app_settings`, `notices` |
| Generation history and swaps | `generation_runs`, `timetable_swaps` |

Course details and learning objectives are stored in `courses`. Academic workload, room utilization, and timetable analytics use the existing resource, assignment, session, and generation tables. No separate Course Details or Analytics table is assigned in this phase.

### Database Branches and Merge Order

Each stage starts from updated `main` after the preceding Pull Request has been merged by the repository administrator.

| Order | Member | Branch | Responsibility |
| --- | --- | --- | --- |
| 1 | 2022/ICT/114 | `feature/2022-ict-114-database-foundation` | Shared schema, relations, database setup, connection and configuration |
| 2 | 2022/ICT/023 | `feature/2022-ict-023-users-database` | User and student database verification |
| 3 | 2022/ICT/051 | `feature/2022-ict-051-notices-settings-database` | Notices and application settings verification |
| 4 | 2022/ICT/139 | `feature/2022-ict-139-staff-rooms-assignments` | Staff, rooms and teaching assignment verification |
| 5 | 2022/ICT/054 | `feature/2022-ict-054-database-testing` | Database testing and setup documentation |
| 6 | 2022/ICT/041 | `feature/2022-ict-041-import-validation` | Safe sample import validation |
| 7 | 2022/ICT/114 | `feature/2022-ict-114-database-final-integration` | Final integrated database verification and documentation |

Only commit assigned files that were genuinely changed. Verification that requires no schema correction does not require an artificial schema commit.

### Final Database Integration

After all five other database Pull Requests have been merged, 2022/ICT/114 checks the integrated database using the procedure in [LOCAL_SETUP.md](LOCAL_SETUP.md).

The final integration documentation commit contains:

- `README.md`
- `LOCAL_SETUP.md`

Record actual test results before describing verification as complete. If verification reveals a code or schema problem, resolve it through the appropriate reviewed database change before completing integration.

## Feature Development Branches

These branches are for feature development, separate from the database-only Pull Requests.

| Member | Branch | Main Responsibility |
| --- | --- | --- |
| Member 1 | `feature/student-batch-management` | Student and batch management |
| Member 2 | `feature/academic-data-management` | Subjects, lecturers, rooms and academic data |
| Member 3 | `feature/timetable-generation` | Timetable generation and scheduling logic |
| Member 4 | `feature/constraints-conflicts` | Availability constraints and conflict detection |
| Member 5 | `feature/frontend-timetable` | Timetable interface, views and search/filter features |
| Member 6 | `feature/auth-reports` | Authentication, roles, reports and notifications |

### Additional Branches

- `prototype`: early UI and prototype work.
- `feature/documentation`: project-wide requirements, database, architecture, and API documentation.

## Development Workflow

1. Start from updated `main` and create the assigned feature branch.
2. Commit only files belonging to that stage or feature.
3. Push the feature branch and open a Pull Request to `main`.
4. The repository administrator reviews and merges the Pull Request.
5. The next database member starts from the updated `main`.

Do not push directly to `main`.

Database-only Pull Requests exclude `.env`, `node_modules/`, `client/`, `shared/`, feature-specific backend implementation, `scripts/seed-sample.ts`, real student information, passwords, API keys, and live database files. `.env.example` may contain placeholders only.

## Documentation

Local setup instructions and the final verification record are maintained in [LOCAL_SETUP.md](LOCAL_SETUP.md).

Additional project documentation is maintained in:

```text
docs/
├── requirements/
├── database/
├── architecture/
└── api/
```

## Team

This project is developed as a university group project by six team members.
