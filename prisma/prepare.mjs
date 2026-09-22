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
  if (!synced) {
    console.log(
      "[prepare] db push did not complete this build. The database is very " +
        "likely already provisioned from an earlier deploy, so the seed and " +
        "patch steps below still run — each is idempotent and individually " +
        "non-fatal. Gating them behind db push meant a single transient direct-" +
        "connection hiccup silently skipped every demo backfill, which is worse " +
        "than attempting them against an already-correct schema.",
    );
  }
  // Run the seed/patch steps whether or not THIS build's db push completed.
  // Every step is idempotent (guarded by a presence check) and non-fatal, so
  // running them against an already-provisioned database is safe, and it means a
  // transient push failure no longer wipes out the demo data from the deploy.
  run("Seeding if empty", "npx tsx prisma/bootstrap.ts", POOLED);
  // Idempotent: brings existing notice rows up to the revised data shape
  // (Fiduciary / Category / Purpose / Rule 3) on databases seeded before it, and
  // seeds the consent records the Artifact Integrity dashboard verifies.
  run("Backfilling notice metadata", "npx tsx prisma/patch-notices.ts", POOLED);
  // Idempotent: seeds the element-level Data Map demo (Loan Application).
  run("Seeding Data Map demo", "npx tsx prisma/patch-datamap.ts", POOLED);
  // Idempotent: seeds the Vendor Risk (TPRM) demo vendors.
  run("Seeding Vendor Risk demo", "npx tsx prisma/patch-tprm.ts", POOLED);
  // Idempotent: backfills the Role capability model and seeds the Identity &
  // Access demo (custom roles, assignments, drift).
  run("Seeding Identity & Access demo", "npx tsx prisma/patch-rbac.ts", POOLED);
  // Idempotent: seeds the Breach Management demo (live + submitted incidents).
  run("Seeding Breach demo", "npx tsx prisma/patch-breach.ts", POOLED);
  // Idempotent: materialises DPRR tickets + routing/extension/escalation demo.
  run("Seeding DPRR demo", "npx tsx prisma/patch-dprr.ts", POOLED);
  // Idempotent: seeds the Scenario 3 audit/evidence/conflict-escalation demo.
  run("Seeding Audit & Escalation demo", "npx tsx prisma/patch-audit.ts", POOLED);
  // Idempotent: seeds the Scenario 1 cross-system deletion-fulfilment demo.
  run("Seeding Fulfilment demo", "npx tsx prisma/patch-fulfillment.ts", POOLED);
  // Idempotent: seeds Scenario 4 discovery governance + quarantine demo.
  run("Seeding Discovery governance demo", "npx tsx prisma/patch-scenario4.ts", POOLED);
  // Idempotent: seeds Scenario 6 data categories, notice variants, cookie category.
  run("Seeding Consent/Notices demo", "npx tsx prisma/patch-scenario6.ts", POOLED);
  // Idempotent: seeds protection-rule exception + acquisition entity demo.
  run("Seeding Protection/Entity demo", "npx tsx prisma/patch-scenario7.ts", POOLED);
  // Idempotent: seeds assisted/omnichannel demo (doc types, templates, offline
  // queue, assisted channel tags, multi-channel deliveries, unification check).
  run("Seeding Omnichannel demo", "npx tsx prisma/patch-omnichannel.ts", POOLED);
}
