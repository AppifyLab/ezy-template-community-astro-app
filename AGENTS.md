# Rules for AI agents working in this app

This repo is ONE community's website AND its own app, in one Astro project on
ONE Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`). It already
works end to end: server-rendered pages, a blog, a job board with search, a
members' dashboard, sign-in awareness, uploads, a backend and a database.
Extend it with the recipes below; don't rebuild what is here.

## Current platform rules (read first)

This file is frozen at the template's tag; the platform's rules are not. Read
the live rules and follow them over this file:

- `https://<your site's hostname>/api/public/site/v1/agent-docs` (core + topic list)
- `…/agent-docs/<topic>.md`: `auth.md`, `uploads.md`, `public-api.md`,
  `community-key.md`, `site-api.md`, `site-database.md`, `publishing.md`;
  `changes.md` lists what is new.
- Inside the EzyCommunity editor: `/opt/ezy/docs/<topic>.md`.

## Architecture: one Worker, Hono is the backend

```
browser ──► Astro page (SSR, the view only) ──in-process──► Hono /site-api ──► platform API / Site Database
browser ──► /portal (React) ───────── fetch /site-api ────► Hono /site-api ──► platform API / Site Database
```

- **Hono (`src/server/app.ts`, `src/server/routes/*`) is the ONLY backend.**
  Every read and write goes through a Site API route: validation, auth
  guards, platform calls and the database all live there.
- **Pages are the view.** They call the Site API IN-PROCESS with
  `backend(Astro.request)` (`src/server/backend.ts`): the same Hono app,
  invoked directly, with no network hop and nothing in between. A page never
  calls the platform or the database itself.
- **The portal** (`/portal/*`, React) calls the same routes from the browser
  with the typed `hc` client (`src/portal/api.ts`).
- **One Worker, one build, one deploy.** Pages, the Site API and the portal
  always go live together. Don't add a second Worker, a service binding, a
  queue, KV/R2/D1 or Durable Objects: the platform gives a Site none of them.

| Path                    | What                                     | Code                                  |
| ----------------------- | ---------------------------------------- | ------------------------------------- |
| `/`                     | home, as sections                        | `src/pages/index.astro`               |
| `/about`                | static content page                      | `src/pages/about.astro`               |
| `/blog`, `/blog/<slug>` | the community's blog (publication style) | `src/pages/blog/`                     |
| `/jobs`, `/jobs/<slug>` | job board: search, filters, detail       | `src/pages/jobs/`                     |
| `/portal/*`             | members' dashboard (React)               | `src/portal/`, `src/pages/portal/`    |
| `/site-api/*`           | the backend (Hono)                       | `src/server/app.ts`, `src/server/routes/` |
| —                       | Site Database (Prisma Postgres)          | `prisma/`, `src/server/db.ts`         |
| —                       | words, nav, home sections                | `src/content/site.ts`                 |

Every other path on the hostname (`/login`, `/register`, `/join`, `/feeds`,
`/profile/…`, `/dashboard`, `/api`, `/_next`, `/robots.txt`, `/sitemap.xml`…)
is the EzyCommunity App: link to it with a plain `<a href>`, never a client
router link, and never create a page under it.

## Environment

Read with `import {env} from 'cloudflare:workers'` in SERVER code only
(`Astro.locals.runtime` no longer exists). Typed in `src/env.d.ts`.

| Name                | Deployed                         | Editor Preview                 | Your machine (`.env`) |
| ------------------- | -------------------------------- | ------------------------------ | --------------------- |
| `EZY_SITE_URL`      | platform host (plain var)        | platform host                  | you set it            |
| `EZY_PREVIEW`       | never set                        | `'1'`                          | unset (or `1` to try) |
| `EZY_COMMUNITY_KEY` | the live key (secret)            | the editor key                 | optional              |
| `DATABASE_URL`      | live Site Database (secret)      | the Preview Database           | optional              |

- **Which origin to call** (`siteOrigin` in `src/server/platform.ts`): deployed,
  the request's OWN origin. The visitor may be on the community's custom
  domain, and a live Site may only fetch the host it was visited on. In the
  Preview and on your machine, `EZY_SITE_URL`. Always go through
  `platform.ts` / `viewer.ts`; never build a platform URL yourself.
- Empty `DATABASE_URL` = Site Database not enabled: routes answer 503 (`withDb`);
  ask the owner to enable it. Missing key: 503 `community_key_missing`.
- Never send a secret to the browser, log it, write it to a file (`.env`,
  `.dev.vars`, config) or commit it. A `.dev.vars` file stops the Preview
  from receiving secrets. You cannot add secrets; never ask for one.
- Deployed server code reaches ONLY the community's own host and
  `db.prisma.io`; everything else is `403 Egress blocked`. No raw TCP.

## Auth: borrowed from EzyCommunity, never built here

This site has NO login of its own. Visitors sign in on the community
(`/login?redirectTo=<path>`, `/register?redirectTo=<path>`, applicants `/join`;
`redirectTo` is a URL-encoded PATH). Never build a login, sign-up, password or
account page, never ask for a password, never handle tokens.

- **Deployed:** `getViewer(request)` (`src/server/viewer.ts`) forwards the
  visitor's `cookie` header, unchanged, to `/api/auth/me` on the community's
  own host and branches on the STATUS. States: `member`, `applicant` (pending:
  link to `/join`, no member content), `returning` (access token expired; the
  layout's script refreshes ONCE in the browser and reloads), `guest`.
  Permissions: `getViewerPermissions()` → `/api/auth/me/permissions`;
  `grants(perms, codename)` mirrors the Role Manager's wildcards.
- **Editor Preview (`EZY_PREVIEW=1`):** the Preview has no visitor session at
  all (no cookies reach the dev server, App writes are 404). The site runs a
  STAND-IN viewer: a signed-in member holding every permission, marked
  `preview: true` and shown as a "Preview" chip. Writes go to the Preview
  Database. Platform reads still use the Community Key, server to server.
  Browser-only App calls (uploads, sign out) cannot run there: the UI says so.
  Never derive a stand-in from anything but `EZY_PREVIEW`.
- **Browser:** `src/lib/browser-session.ts`: `appFetch()` (sends
  `X-XSRF-TOKEN` on writes, ONE shared `/api/auth/refresh` on 401),
  `logout()`, `uploadFile()`.
- Never call `/api/auth/refresh` from the server, never set/rename/delete the
  auth cookies (`ecom_at`, `ecom_rt`, `__Host-` prefixed in production), never
  set `x-forwarded-for`, `x-real-ip` or `ECOM_HOST`, never keep a viewer in a
  module variable. A response built from a visitor is `Cache-Control:
  private, no-store` (`pageContext` and `withViewer` do it).
- Never send any member's email to the browser. `/api/auth/me` carries the
  viewer's own; `getViewer` drops it.

## Server to server

| Call                                | Credential                         | Code                       |
| ----------------------------------- | ---------------------------------- | -------------------------- |
| `/api/public/...` (blog, brand)     | none                               | `publicGet()`              |
| `/api/site/v1/...` (members, feed…) | `Bearer EZY_COMMUNITY_KEY`         | `communityGet()`           |
| `/api/auth/me...` (the visitor)     | the visitor's own cookies          | `fetchAsVisitor()`         |

The Community Key is read-only, member level, never emails or payment data,
and it is the COMMUNITY, not the visitor: show what it reads only after the
visitor's own session allows it (`requireMember`). Every answer is re-projected
field by field into `src/lib/types.ts` shapes. Every call has a timeout and
never throws into a page: a page renders its fallback instead.

## Uploads

Browser only, signed-in members, deployed site only: presign → `PUT` to the CDN
→ register (`uploadFile()`), then save the link with `POST /site-api/uploads`.
The bytes never pass through the Worker. Limits and errors: `uploads.md`.
`402` = the community's storage is full or not in its plan: say uploads are
unavailable, never retry. Always `skip_gallery: true`.

## Recipes

### A Site API route (do this first for any new data)
1. `src/server/routes/<name>.ts`: `export const <name>Routes = new Hono()…`,
   routes CHAINED. Guards in this order: `validator` → `withViewer` →
   `requireMember` → `requirePermission(codename)` → `withDb`
   (`src/server/guards.ts`).
2. Mount it in `src/server/app.ts`: `.route('/<name>', <name>Routes)` (chained).
3. Shapes in `src/lib/types.ts`. Select columns explicitly; JSON errors
   `{error, message}`; lists keyset-paged (`?before=<id>`, `take: n + 1`,
   `nextBefore`), never a count.

### A server-rendered list + search + detail (like `/jobs`, `/blog`)
1. The data route first (above): `GET /` with a `validator('query')` for
   `search`, filters and the cursor; `GET /:slug` for one item (404 when
   missing).
2. List page `src/pages/<name>/index.astro`: read the query string, call
   `backend` through `pageContext`, render. Search and filters are a plain
   `<form method="get">`, so every result is a real, shareable, crawlable URL.
   "Older" follows the cursor (`?before=`).
3. Detail page `src/pages/<name>/[slug].astro`: unknown → `Astro.response.status
   = 404` and `<NotFound>`. Plain text renders as paragraphs; HTML only after
   `sanitizeHtml` (`src/lib/sanitize.ts`).
4. Add it to `NAV` in `src/content/site.ts`. Search on a growing table: a
   bounded `contains` is fine for hundreds of rows; add a trigram/full-text
   index (a migration) before it holds thousands.

### A static content page (like `/about`)
`src/pages/<name>.astro` with `pageContext` (brand + visitor) and words from
`src/content/site.ts`. It stays server-rendered so the header knows who is
signed in; keep it free of data calls. Add it to `NAV`.

### A dashboard screen (like `/portal/jobs`)
1. Its Site API routes (above), guarded by `requireMember` and, for admin
   screens, `requirePermission(codename)`.
2. A `createRoute` in `src/portal/routes.tsx` + `routeTree.addChildren`.
   Data with TanStack Query through `api.<route>.$get/$post…` (typed); list
   pages with `useInfiniteQuery` + the cursor.
3. Show the nav link from `/site-api/me` `abilities` (add the ability in
   `app.ts` `/me` and `Abilities`). That only HIDES the link; the route's
   guard is the enforcement.

### A member-only or admin-only page
Server: `viewer.state === 'member'` / an ability from `pageContext`; render the
sign-in prompt otherwise (see `src/pages/portal/[...path].astro`). The data
route enforces it again. Codenames used here: `community:site:update`
(manage jobs).

### A new table
Edit `prisma/schema.prisma`, `npx prisma migrate dev --create-only --name <change>`,
wrap the new `migration.sql` in `BEGIN;` … `COMMIT;`, `npx prisma migrate dev`.
Fake rows in `prisma/seed.sql` (example.com only). Rules below.

## Site Database (Prisma Postgres)

- Tables: `jobs`, `uploads`, `notes` (unused v0.1 example, kept: dropping it
  needs a migration and the owner's approval).
- Prisma ORM 7 ONLY (`prisma`, `@prisma/client`, `@prisma/adapter-ppg` on the
  same 7.x); Prisma 8 needs raw TCP. Generator `prisma-client`,
  `runtime = "workerd"`, output `src/generated/prisma` (git-ignored); the build
  runs `prisma generate` first.
- `getDb()` makes a NEW client per request (a Worker must not share I/O
  objects between requests) and returns `null` without `DATABASE_URL`.
- Never edit or delete an applied migration. Forward-only:
  expand-then-contract; drops, truncates and type changes wait for the
  owner's approval. The platform applies pending migrations at Publish,
  before the new version goes live; a failure keeps the old version serving.
- Lists are bounded (`take` + keyset cursor); never an unbounded `findMany`
  or a `count()` per request.

## Production rules

- No state across requests: no module-level caches of visitor data, clients
  or responses.
- Every platform call has a timeout (`platform.ts`, 8 s) and every page has a
  fallback for `null`: a slow API makes a section disappear, never a 500.
- Keep the adapter `@astrojs/cloudflare` (14.x); `@astrojs/node|vercel|netlify`
  are refused. npm only, `package-lock.json` committed (the Build runs
  `npm ci`), `allowScripts` approves install scripts.
- Commit NO wrangler config: the platform writes it. No `Astro.session`, no
  on-demand image transforms (`imageService: 'passthrough'`), no `robots.txt`
  / `sitemap.xml`, no `base`, no `.github/workflows/`.

## How changes go live

You edit a working copy; nothing visitors see changes until the OWNER
publishes: Publish → Prepare → Build (`npm ci`, `npm run build`) → Migrate →
Deploy. Keep `npm run dev` working at `/`: the editor Preview runs it.
