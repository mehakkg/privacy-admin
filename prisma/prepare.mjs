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
  const migrated = run("Applying migrations", "npx prisma migrate deploy");
  if (migrated) run("Seeding if empty", "npx tsx prisma/bootstrap.ts");
}
