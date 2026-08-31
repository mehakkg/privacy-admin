/**
 * Runs on every deploy, immediately after `prisma migrate deploy`.
 *
 * Seeds the database only if it is EMPTY. The first deploy against a fresh
 * Postgres therefore comes up with the demo fixtures already loaded, and every
 * later deploy leaves the data alone.
 *
 * The alternative — seeding on every build — would wipe the database each time
 * the code changed, which means anything anyone did on the deployed prototype
 * (acknowledging an obligation, executing, attesting) would silently disappear
 * the next time a commit landed. For a prototype people are clicking through,
 * that is worse than a stale fixture.
 *
 * To deliberately reset a deployed database, run `npm run db:seed` against it.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("bootstrap: no DATABASE_URL, skipping.");
    return;
  }

  const actors = await prisma.actor.count();
  if (actors > 0) {
    console.log(`bootstrap: database already has ${actors} actors, leaving it alone.`);
    return;
  }

  console.log("bootstrap: database is empty, loading seed fixtures…");
  await import("./seed");
}

main()
  .catch((error) => {
    // A bootstrap failure must not take the whole deploy down: the app can
    // serve an empty database, and an empty prototype is recoverable in a way
    // that a failed deploy in the middle of a demo is not.
    console.error("bootstrap failed (continuing):", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
