# Local Database Setup and Final Integration

This guide covers the database management phase of the Automated University Timetable Management System. Run terminal commands from the project root, where `package.json` is located.

**Verification status: Pending.** No execution results have been supplied. Complete the verification record using actual local results.

## 1. Prerequisites

- Git and access to the project repository.
- Node.js and pnpm compatible with the versions specified by the project's `package.json`.
- A running local MySQL server and an account permitted to create and manage the test database.
- The merged database foundation files, including `.env.example`.

Check installed tools:

```bash
node --version
pnpm --version
git --version
```

Use the project's `packageManager` and `engines` fields, when present, to select versions. This guide does not specify versions because `package.json` has not been provided for inspection.

## 2. Start the Final Integration Branch

For 2022/ICT/051, start only after the five other database Pull Requests have been merged by the repository administrator.

```bash
git switch main
git pull origin main
git switch -c feature/2022-ict-051-database-final-integration
```

If this branch already exists locally, switch to it rather than creating it again.

## 3. Install Dependencies

```bash
pnpm install
```

Use the existing `package.json` and `pnpm-lock.yaml`. Do not run `pnpm init` in this existing project.

## 4. Configure Local Environment Variables

In Git Bash, create your local environment file:

```bash
cp .env.example .env
```

If `.env` already exists, edit the existing file instead of overwriting it.

Fill in the database connection values using the exact variable names in `.env.example` and the configuration read by `drizzle.config.ts`, `server/_core/env.ts`, and `server/db.ts`. Use local credentials and a dedicated test database.

The environment variable names and database name must be confirmed from those project files; they have not been inspected for this guide.

Keep `.env` local. Never commit credentials or replace placeholders in `.env.example` with real secrets.

## 5. Create the Local MySQL Database

1. Start your local MySQL server.
2. Open `database/create-database.sql` and check its database name and SQL statements.
3. Execute the script using MySQL Workbench or your MySQL command-line client against the local test server.
4. Ensure your local environment configuration points to that database.

Use an empty test database for clean setup verification. Review setup scripts before executing them against any database containing existing data.

The project also includes `server/setupSchema.ts` and `server/setupDatabase.ts`. Check `package.json` for their supported invocation if additional initialization is required. Do not assume a script name or run multiple setup methods without checking how they are intended to work together.

## 6. Apply the Database Schema

Run the command assigned in the database push plan:

```bash
pnpm db:push
```

Review any schema changes requested by the command before confirming them. Verify that the following expected tables exist in the configured MySQL database:

```text
users
staff
rooms
courses
course_lecturers
sessions
session_staff
session_exceptions
app_settings
notices
generation_runs
timetable_swaps
```

Compare the resulting schema with `drizzle/schema.ts`, `drizzle/relations.ts`, and the setup scripts. Investigate missing tables, mismatched fields, and relationship problems before marking this check as passed.

## 7. Run the Project Check

```bash
pnpm check
```

Record the exit result and any errors. Check the script definition in `package.json` to understand its scope. This command alone does not prove database connectivity, data persistence, or successful imports.

## 8. Validate Safe Sample Imports

Use only fictional sample information from the assigned fixtures:

| Fixture | Database mapping |
| --- | --- |
| `server/__fixtures__/courses.csv` | `courses` |
| `server/__fixtures__/lecturers.csv` | `staff` and `users` |
| `server/__fixtures__/rooms.csv` | `rooms` |
| `server/__fixtures__/students.csv` | `users` |
| Teaching profile data | `course_lecturers` |

Use the implemented import path when available. Check required columns, programme and level parsing, course codes, lecturer profiles, room types and capacities, registration numbers, duplicate matching, update-existing behaviour, invalid rows, and reported error reasons.

If the import path is unavailable during this database-only stage, record the check as Pending or Blocked with the reason. Do not claim successful import testing based only on the presence of CSV files.

## 9. Check Data Persistence

1. Insert or import a fictional test record through an available supported path.
2. Confirm the record exists in MySQL.
3. Restart the application using its documented command from `package.json`, when the application runtime is available.
4. Query the database again and confirm the same record remains.

Record any unavailable runtime or incomplete test as Pending or Blocked. Do not invent an application start command.

## 10. Check Files Before Committing

```bash
git status
git ls-files .env node_modules
git diff -- README.md LOCAL_SETUP.md
```

The `git ls-files` command should return no tracked `.env` or `node_modules` files. Also review the staged content for real student information, passwords, API keys, and live database files.

## 11. Final Verification Record

Replace Pending only after performing each check. Include the date, tester, and evidence or error details. A failed or unavailable check must remain clearly recorded.

| Check | Status | Evidence / Notes |
| --- | --- | --- |
| Five other database Pull Requests merged | Pending | Record merged PR references |
| Clean local MySQL database setup | Pending | Record database setup result without credentials |
| Dependency installation | Pending | Record `pnpm install` result |
| Schema application | Pending | Record `pnpm db:push` result |
| All 12 expected tables exist | Pending | Record table inspection result |
| Schema, relations and setup scripts agree | Pending | Record comparison result |
| Project check | Pending | Record `pnpm check` result |
| Safe sample import validation | Pending | Record cases and outcomes |
| Data persists after application restart | Pending | Record fictional test record check |
| `.env` and `node_modules/` are not tracked | Pending | Record tracked-file check |
| No real data, credentials or live database files staged | Pending | Record staged review |

- **Tester:** 2022/ICT/114
- **Verification date:** Pending
- **Overall result:** Pending
- **Unresolved issues:** Record after testing

## 12. Commit Final Integration Documentation

Once verification is completed and the results are documented, stage only these two documentation files:

```bash
git add README.md LOCAL_SETUP.md
git diff --cached --name-only
git diff --cached
git commit -m "test: verify final database integration"
git push -u origin feature/2022-ict-114-database-final-integration
```

Confirm that the staged list contains only `README.md` and `LOCAL_SETUP.md`. If other files are staged, remove them from the staging area before this documentation commit.

Open a Pull Request with:

- **Base:** `main`
- **Compare:** `feature/2022-ict-114-database-final-integration`
- **Title:** `test: verify final database integration`

The repository administrator reviews and merges the Pull Request. Do not push directly to `main`.
