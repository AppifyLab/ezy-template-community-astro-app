# Community site — Astro app

A starter for your community's **public website plus your own small app**,
built with [Astro](https://astro.build) and running on a Cloudflare Worker:

- **Pages** (`/`, `/blog`) rendered on request from your community's live data;
- a **portal** at `/portal` — a React app with
  [TanStack Router](https://tanstack.com/router) and
  [TanStack Query](https://tanstack.com/query);
- your own **Site API** at `/site-api` — a [Hono](https://hono.dev) backend;
- your own **Site Database** — Prisma Postgres, through
  [Prisma ORM 7](https://www.prisma.io).

One project, one build, one deploy: the pages, the portal and the API always
go live together.

## Put it live

Make your own copy first — this repository is a template, you never edit it
directly:

- **Open it in the editor** — pick **Astro app** in your dashboard's code
  editor, change what you like (or ask an agent), then **Publish**.
- **Upload a zip** — download this template as a zip, change it and upload the
  project folder on the **Custom code** page of your dashboard.
- **Or connect GitHub** — click **Use this template** on GitHub, then pick
  that repository and a branch on the dashboard. Every push redeploys.

**Enable the Site Database first** (Custom code → Site Database). This project
ships a database migration, and a version with migrations is refused until
your community has a Site Database. Without one, the pages still work and the
Site API answers that the database is not enabled.

The platform sees `astro` and `@astrojs/cloudflare` in `package.json`, installs
with `npm ci` (keep `package-lock.json` committed), runs `npm run build`
(`prisma generate && astro build`), applies new migrations to your live
database, then deploys the Worker. If a migration fails, the previous version
keeps serving.

## What this site controls — and what it doesn't

| Address                    | Served by        |
| -------------------------- | ---------------- |
| `/`, any page slug, `/blog` | **this site**    |
| `/portal/…`                | **this site** (the React app) |
| `/site-api/…`              | **this site** (your API) |
| `/login`, `/join`, `/feeds`, `/dashboard`, `/api` … | EzyCommunity |

Link to the community app with ordinary links (`<a href="/feeds">`). A page
you add under an app path is never reached by visitors.

## Data

- **Your community's public data** — name, logo, blog posts — is read on the
  server from `/api/public/...` (`src/lib/api.ts`).
- **Reading as your community** — `src/server/community.ts` calls
  `/api/site/v1/...` with your **Community Key** (`EZY_COMMUNITY_KEY`, set by
  the platform). It sees what an ordinary member sees, never email addresses
  or payment data, and it is read-only. Example: `GET /site-api/community`.
- **Your own data** lives in your Site Database (`DATABASE_URL`, set by the
  platform). Example: the notes at `/portal/notes`, served by
  `GET`/`POST /site-api/notes`.

What you store in your Site Database is yours — and your responsibility.
Deployed code can reach only your own community's address and your Site
Database; calls to any other service are blocked.

## Changing the database

```bash
# 1. edit prisma/schema.prisma, then create the migration without applying it
npx prisma migrate dev --create-only --name add-something
# 2. wrap the new prisma/migrations/<…>/migration.sql in BEGIN; … COMMIT;
# 3. apply it to the Preview Database
npx prisma migrate dev
```

In the editor, `DATABASE_URL` is your **Preview Database** — a separate
database, so experiments never touch live data. `npx prisma db seed` fills it
with the fake data in `prisma/seed.sql`; `npm run studio` opens Prisma Studio
on port 5555. Publishing applies your migrations to the live database.

Migrations only move forward: never edit one that was already applied, and
change tables in steps (add a column, fill it, switch the code, drop the old
one later). Dropping or retyping a column waits for your approval at Publish.

## Running it on your machine

```bash
cp .env.example .env     # set EZY_SITE_URL to your community's address
npm install
npm run dev              # http://localhost:4321
npm run build            # the Worker, into dist/
```

`.env` is for your machine only and is git-ignored — never commit it. To try
the database locally, put your Preview Database's connection string (Site
Database panel) in `DATABASE_URL` there.

## Where things are

```
prisma/
  schema.prisma          your tables
  migrations/            one folder per change, applied in order at Publish
  seed.sql               fake data for the Preview Database
src/
  pages/
    index.astro          the home page
    blog/                the blog list and a single post
    portal/[...path].astro  hosts the portal app for every /portal/* URL
    site-api/[...path].ts   hands every /site-api/* request to the Hono app
    404.astro            any address that has no page
  portal/                the React app: routes, typed API client
  server/
    app.ts               the Site API routes
    db.ts                the Site Database client
    community.ts         reads the community API with the Community Key
  lib/api.ts             the public API calls the pages make
  middleware.ts          stops a server fetch from looping back into the site
  layouts/, components/, styles/
```

## Getting help

Broke something? Your recent deploys are kept, so you can redeploy an earlier
one from your dashboard while you fix it — database migrations stay applied,
which is why they only ever add before they remove.
