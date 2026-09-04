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

// Different Postgres providers hand Vercel different env-var names. Resolve the
// runtime (pooled) connection and, separately, a direct (non-pooling) one — DDL
// like `db push` should go over a direct connection, not a PgBouncer pool.
const POOLED =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  "";
const DIRECT =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  POOLED;

function run(label, command, url) {
  try {
    console.log(`\n[prepare] ${label}…`);
    // Prisma reads DATABASE_URL; point each step at the right connection.
    execSync(command, { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
    return true;
  } catch {
    console.log(`[prepare] ${label} did not complete. Continuing with the build.`);
    return false;
  }
}

if (!POOLED) {
  console.log(
    "\n[prepare] No Postgres connection string found (DATABASE_URL / " +
      "POSTGRES_PRISMA_URL / POSTGRES_URL).\n[prepare] The build will finish, but " +
      "pages that read data will error until you attach a Postgres\n[prepare] store " +
      "(Storage → Create Database → connect to this project) and redeploy.\n",
  );
} else {
  // Sync the FULL current schema onto the attached Postgres with `db push`
  // rather than `migrate deploy`: the committed migration history is a single
  // early baseline, so `migrate deploy` would leave most tables missing. db push
  // makes the database match prisma/schema.prisma exactly. Run it over the
  // DIRECT connection; seed over the pooled one the app itself uses.
  const synced = run(
    "Syncing schema (db push)",
    "npx prisma db push --skip-generate --accept-data-loss",
    DIRECT,
  );
  if (synced) {
    run("Seeding if empty", "npx tsx prisma/bootstrap.ts", POOLED);
    // Idempotent: brings existing notice rows up to the revised data shape
    // (Fiduciary / Category / Purpose / Rule 3) on databases seeded before it.
    run("Backfilling notice metadata", "npx tsx prisma/patch-notices.ts", POOLED);
  }
}
