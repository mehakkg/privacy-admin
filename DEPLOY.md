# Deploying to Vercel

The prototype now runs on Postgres rather than a local file, because Vercel does
not keep a filesystem between requests — every write the demo depends on
(acknowledging a retention obligation, executing, attesting) would otherwise
vanish.

## What you do (two steps)

### 1. Create the project and its database

1. Go to <https://vercel.com/new>.
2. Create a new project. When it asks for a repository, choose to skip / create
   an empty project — the code is pushed from this machine, not from GitHub.
3. Open the project → **Storage** tab → **Create Database** → **Postgres**
   (Neon). Accept the defaults and attach it to this project.

Vercel sets `DATABASE_URL` on the project automatically. You never have to copy
it anywhere, and it never appears in chat.

### 2. Log in from this machine

```bash
npx vercel login
```

Then link this folder to the project you just made:

```bash
npx vercel link
```

Tell me once both have finished.

## What happens next (I do this)

1. `npx vercel env pull .env` — brings the connection string down to this
   machine so migrations can run. It lands in `.env`, which is git-ignored.
2. `npx prisma migrate deploy` — creates the tables in the hosted database.
3. `npm run db:seed` — loads the demo fixtures.
4. `npx vercel --prod` — deploys and returns the permanent URL.

Every later deploy is just step 4: `npm run build` runs `prisma migrate deploy`
first, so schema changes travel with the code.

## Notes

- `.env` and `.env*.local` are git-ignored, so the connection string is never
  committed.
- Local development uses the same hosted database once `.env` is pulled. There is
  no second copy of the data to drift out of sync — but it does mean local work
  writes to the same database the deployed site reads.
- `npm run db:seed` **wipes and reloads** everything. Do not run it against a
  deployment anyone is relying on without expecting that.
