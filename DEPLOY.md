# Deploying to Vercel

This is a Next.js app backed by **Postgres** (via Prisma). Locally it runs on
SQLite; on Vercel it needs a real Postgres database. The code is already set up
so that, once a database is attached, the build creates every table and seeds
demo data automatically — you do **not** need to run any migrations by hand.

## One-time setup (≈2 minutes, in the Vercel dashboard)

### 1. Import the project (skip if it already exists)
- Vercel → **Add New… → Project** → import `mehakkg/privacy-admin`.
- Framework preset: **Next.js** (auto-detected). Leave build/output settings default.
- Don't worry if this first deploy errors — it has no database yet. Continue to step 2.

### 2. Attach a Postgres database (this is the step that was missing)
- In the project: **Storage → Create Database → Postgres** → **Connect** to this project.
  (Vercel's Postgres is Neon-backed; the free tier is plenty for a demo.)
- Connecting it automatically sets `DATABASE_URL` (and the pooled/direct variants)
  as environment variables on the project. You do not have to copy anything by hand.

### 3. Redeploy
- **Deployments → ⋯ on the latest → Redeploy** (or push any commit).
- This time the build runs `prisma db push` (creates all tables) and seeds the
  demo data, then serves the app. Landing page is `/dashboard`.

### 4. (Optional) Make it publicly viewable
- If the deployment sits behind Vercel's login wall: **Settings → Deployment
  Protection → Vercel Authentication → Disabled** (or add the people who should see it).

## Why it failed before
- The committed Prisma migration history is a single early baseline. `prisma
  migrate deploy` (the old build step) only applied that baseline, so most tables
  were never created and every data page errored. The build now runs `prisma db
  push` instead, which makes the database match the current schema exactly.
- And there was simply no database attached — SQLite is local-only.

## Notes
- `next.config.ts` intentionally ignores ESLint/type errors during the build so a
  stray lint finding can't block a deploy. Flip both back on before treating this
  as production.
- `prisma/prepare.mjs` is non-fatal and idempotent: it seeds only when the
  database is empty, so redeploys won't duplicate data.
- Connection-string variable names differ by provider; the app resolves
  `DATABASE_URL`, then `POSTGRES_PRISMA_URL`/`POSTGRES_URL`, and uses a direct
  (non-pooling) URL for the schema push when one is available.
