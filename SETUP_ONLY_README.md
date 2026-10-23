# UOV Common Setup Files Only — Audited

This ZIP contains only the common baseline/setup files needed to install, check, test, build and start the existing project. It does **not** contain the 20 feature folders or feature implementation files.

## Important omitted files

- `.env` is intentionally omitted because it may contain secrets. Use `.env.example`.
- `node_modules/`, `dist/` and logs are intentionally omitted.
- `drizzle/*.sql`, `drizzle/schema.ts`, `drizzle/relations.ts` and feature source files are not setup-only; keep them in your existing 20-feature package.
- `.manus`, `.project-config.json` and `template.json` are platform/project metadata, not required Git baseline setup files.

## Copy rule

Copy every file in this ZIP to the same relative path inside your existing `uov-timetable-work` folder. Do not copy the ZIP's README into the application unless you want the documentation.

## Initial setup commit

```powershell
git switch main
git pull origin main

git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts drizzle.config.ts components.json
git add .env.example .gitignore .prettierignore .prettierrc
git add client/index.html client/src/main.tsx client/src/index.css client/src/lib/trpc.ts
git add server/db.ts server/setupDatabase.ts server/setupSchema.ts server/_core/
git add shared/ database/create-database.sql scripts/seed-sample.ts
git add patches/ run-uov-timetable.bat run-uov-timetable.command

git diff --cached --check
git diff --cached --stat
pnpm install
pnpm check
pnpm test
pnpm build
git commit -m "chore(setup): add project configuration and bootstrap files"
git push origin main
```

After this setup commit, use the existing 20 feature files for the member branches and feature-wise commits.
