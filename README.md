# Community site — Astro app

A starter for your community's **public website plus your own small app**,
built with [Astro](https://astro.build) and running on a Cloudflare Worker:

- **Pages** rendered on request from live data: a home page made of
  sections, an about page, a **blog** styled like a publication (search,
  featured story, article pages with related posts) and a **job board**
  (search, filters, detail pages);
- **sign-in aware**: pages and the dashboard know whether the visitor is a
  member, using their own community session (they sign in on your community,
  never on a form of yours);
- a **members' dashboard** at `/portal` — a React app with
  [TanStack Router](https://tanstack.com/router) and
  [TanStack Query](https://tanstack.com/query): file uploads, the members
  directory, and job management for site admins;
- your own **backend** at `/site-api` — a [Hono](https://hono.dev) app that
  every page and screen reads through;
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
| `/`, `/about`, `/blog`, `/jobs` | **this site** |
| `/portal/…`                | **this site** (the React app) |
| `/site-api/…`              | **this site** (your API) |
| `/login`, `/join`, `/feeds`, `/dashboard`, `/api` … | your community app |

Link to the community app with ordinary links (`<a href="/feeds">`). A page
you add under an app path is never reached by visitors.

## Data

Every page reads through your backend (`/site-api`), which talks to:

- **your community's public data** — name, logo, blog posts (`/api/public/...`);
- **who is visiting** — the visitor's own community session (`/api/auth/me`);
- **your community, as the community** — members, feed, courses, events, with
  your **Community Key** (set by the platform; read-only,
  never email addresses or payment data);
- **your Site Database** (`DATABASE_URL`, set by the platform) — jobs and
  uploads.

Uploads go from the member's browser straight to your community's storage;
the site keeps the link. Site admins (`community:site:update`) manage jobs at
`/portal/jobs`. Change the words on any page in `src/content/site.ts`.

In the editor's Preview there is no real visitor, so the site runs as a
stand-in signed-in member (a "Preview" chip shows it) and writes go to your
Preview Database. Real sign-in and uploads work on your live site.

What you store in your Site Database is yours — and your responsibility.
Deployed code can reach only your own community's address and your Site
Database; calls to any other service are blocked.

## Fast pages

Home and About are **static**: built once and served as files, with no server
work per visit. The header and the "latest posts / open roles" sections fill
in after load. Blog and jobs are rendered per request so they are always
fresh. Republish to refresh the static pages' text and brand.

## Staying up to date

```bash
npm run platform -- check     # is a newer template release out?
npm run platform -- upgrade   # apply it, keeping your changes (commit first)
npm run platform -- docs --site https://<your community>   # latest platform docs
```

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
cp .env.example .env     # set your community's address
npm install
npm run dev              # http://localhost:4321
npm run build            # the Worker, into dist/
```

`.env` is for your machine only and is git-ignored — never commit it. To try
the database locally, put your Preview Database's connection string (Site
Database panel) in `DATABASE_URL` there.

## Where things are

```
template.json            which template version this site is on
CHANGELOG.md             template releases
scripts/platform.mjs     npm run platform -- docs | check | upgrade
prisma/                  your tables, migrations, seed data
src/
  content/site.ts        navigation, home sections, about copy
  pages/                 the views
    index.astro          home (static)
    about.astro          about (static)
    blog/, jobs/         server-rendered lists, search, detail pages
    portal/[...path].astro  hosts the dashboard (members only)
    site-api/[...path].ts   hands every /site-api/* request to the backend
  portal/                the dashboard (React)
  server/                YOUR backend: app.ts (Hono), routes/, page.ts, backend.ts
  platform/              the template's MANAGED core (auth, platform API,
                         guards, permissions): replaced on upgrade, don't edit
  lib/                   shared types and formatting
```

## Getting help

Broke something? Your recent deploys are kept, so you can redeploy an earlier
one from your dashboard while you fix it — database migrations stay applied,
which is why they only ever add before they remove.
