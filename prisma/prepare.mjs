/**
 * Database preparation, run during the Vercel build.
 *
 * This step is deliberately NON-FATAL. Migrating and seeding are things we want
 * to happen, but they are not reasons to fail a deploy:
 *
 *   - On the very first deploy the Postgres store may not be attached yet, so
 *     DATABASE_URL does not exist. Previously that killed the build, which left
 *     the project with no deployment at all and no URL to show anyone — the
 *     worst outcome, because you cannot even see what is wrong.
 *   - A deploy that succeeds with an unmigrated database renders an error page,
 *     which is recoverable by attaching the store and redeploying.
 *
 * So: try to migrate, try to seed if empty, and let the build continue either
 * way. Every outcome is logged plainly so the build log says what happened.
 */

import { execSync } from "node:child_process";

function run(label, command) {
  try {
    console.log(`\n[prepare] ${label}…`);
    execSync(command, { stdio: "inherit" });
    return true;
  } catch {
    console.log(`[prepare] ${label} did not complete. Continuing with the build.`);
    return false;
  }
}

if (!process.env.DATABASE_URL) {
  console.log(
    "\n[prepare] DATABASE_URL is not set — no database is attached to this " +
      "project yet.\n[prepare] The build will finish, but pages that read data " +
      "will error until you attach a\n[prepare] Postgres store (Storage → Create " +
      "Database) and redeploy.\n",
  );
} else {
  // Sync the FULL current schema onto the attached Postgres with `db push`
  // rather than `migrate deploy`. The committed migration history is a single
  // early baseline and has not been kept in step with the schema as each
  // section was added, so `migrate deploy` would leave most tables missing.
  // `db push` makes the database match prisma/schema.prisma exactly, which is
  // what a prototype deploy needs. --accept-data-loss lets it reconcile an
  // existing store; on a fresh database it simply creates every table.
  const synced = run(
    "Syncing schema (db push)",
    "npx prisma db push --skip-generate --accept-data-loss",
  );
  if (synced) run("Seeding if empty", "npx tsx prisma/bootstrap.ts");
}
