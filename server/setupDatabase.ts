/**
 * `pnpm db:push` — creates / updates every table used by the timetable system.
 * Safe to run any number of times.
 */
import "dotenv/config";
import { getDb } from "./db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required. Check the .env file in the project folder."
    );
    process.exit(1);
  }
  const db = await getDb();
  if (!db) {
    console.error(
      "Could not connect to the database. Is MySQL (XAMPP) running?"
    );
    process.exit(1);
  }
  const { sql } = await import("drizzle-orm");
  const [rows] = (await db.execute(sql.raw("SHOW TABLES"))) as any;
  console.log(
    `Database ready — ${rows.length} tables:`,
    rows.map((row: any) => Object.values(row)[0]).join(", ")
  );
  process.exit(0);
}

main().catch(error => {
  console.error(
    "Database setup failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
