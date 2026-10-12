# Rules for AI agents working in this app

This repo is ONE community's public Site AND its own small app, in one Astro
project on a Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`):

| Path            | What                                   | Where                              |
| --------------- | -------------------------------------- | ---------------------------------- |
| `/`, `/blog/…`  | Astro pages, rendered on request       | `src/pages/`                       |
| `/portal/*`     | a React app (TanStack Router + Query)  | `src/portal/`, `src/pages/portal/` |
| `/site-api/*`   | the Site API: a Hono app               | `src/server/app.ts`                |
| —               | the Site Database: Prisma Postgres     | `prisma/`, `src/server/db.ts`      |

Every other path on the hostname (`/login`, `/join`, `/feeds`, `/dashboard`,
`/api`, `/_next`, `/robots.txt`, `/sitemap.xml`…) is served by the
EzyCommunity App and never reaches this Worker — link to those with a plain
`<a href>`.

## Project

- Keep the adapter `@astrojs/cloudflare` (14.x here). `@astrojs/node|vercel|netlify`
  are refused by the platform.
- npm only: keep `package-lock.json` committed (the Build runs `npm ci`), no
  second lockfile. `allowScripts` in `package.json` approves the install
  scripts the project needs (`prisma`, `@prisma/engines`, `workerd`,
  `esbuild`); after a version bump run `npm install-scripts ls` and approve
  the new versions.
- Commit NO wrangler config (`wrangler.json[c]`/`.toml`): the platform writes
  it. NO `Astro.session`, NO on-demand image transforms (`imageService` stays
  `'passthrough'`): there are no KV, R2, D1, Images or service bindings.
- Never create a page under an App path (`src/pages/api/`,
  `src/pages/login.astro`…) or a `robots.txt` / `sitemap.xml`.
- No `base`, no asset prefix, no `.github/workflows/`.

## Astro pages

- Community data through `src/lib/api.ts` (the public API), called in page
  frontmatter. It re-projects every response field by field — keep that, so
  a member email can never reach a page.
- Server code reads `EZY_SITE_URL` with `import {env} from 'cloudflare:workers'`
  (`Astro.locals.runtime` no longer exists). Relative fetch URLs fail on the
  server; server fetches send a `User-Agent` (Cloudflare 403s without one).
- An unknown post sets `Astro.response.status = 404` and renders `NotFound`.
- `src/middleware.ts` answers any `/api/…` request that carries
  `SELF_FETCH_HEADER` with a bare 404, so a fetch that lands back on this
  site (on your own machine there is no App behind `/api`) can't loop
  through the 404 page. Every server-side fetch to `/api` sends that header.

## Portal (`/portal/*`)

- `src/pages/portal/[...path].astro` renders `<PortalApp client:only="react" />`
  for every `/portal/*` URL; TanStack Router (`basepath: '/portal'`) picks the
  screen in the browser. Routes live in `src/portal/routes.tsx`.
- Data comes from the Site API through TanStack Query and the typed `hc`
  client (`src/portal/api.ts`), never straight from `/api`.
- `<Link>` inside the portal; plain `<a href>` to Astro pages and App pages.
- `/portal` is this Template's convention, not a reserved path. To move it,
  rename the page folder AND `basepath` together — never under an App path.

## Site API (`/site-api/*`)

- One Hono app, `new Hono().basePath('/site-api')`, mounted ONLY by
  `src/pages/site-api/[...path].ts` (`ALL`, `prerender = false`). Add routes in
  `src/server/app.ts`, CHAINED, so `AppType` stays complete for `hc`.
- Errors are JSON `{error, message}`; the `notFound` and `onError` handlers
  stay. `csrf()` stays on unless a route is deliberately cross-site (a webhook).
- Validate every input (`hono/validator`) and select columns explicitly.
- Pages call it in-process: `hc<AppType>(url, {fetch: app.request})` — no
  network hop.

## Secrets and the network

- The platform sets `DATABASE_URL` (the Site Database; in the editor, its
  Preview Database) and `EZY_COMMUNITY_KEY` as Worker secrets. Read them from
  `env` (`cloudflare:workers`) in server code only. Never send them to the
  browser, log them, write them to a file (`.env`, `.dev.vars`, config) or
  commit them. A `.dev.vars` file stops the editor Preview from receiving them.
- You cannot add secrets: never hardcode a key, token or password, never ask
  the owner for one.
- Deployed server code reaches ONLY the community's own hostname and the Site
  Database (`db.prisma.io`); every other host fails `403 Egress blocked`. Raw
  TCP (`pg`, `postgres`, `node:net`) does not work at all.

## Reading the community

- Public data: `src/lib/api.ts` → `/api/public/...` (signed-out view).
- As the Community: `src/server/community.ts` → `/api/site/v1/...` with
  `Authorization: Bearer ${env.EZY_COMMUNITY_KEY}`. Read-only, member level,
  never emails or payment data. Gate member-only content on the visitor's own
  session before showing it. Re-project every response field by field.
- As the visiting member: forward the visitor's `cookie` header to the
  community's API.
- Never render or send a member's email address to the browser.

## Site Database (Prisma Postgres)

- Prisma ORM 7 ONLY: `prisma`, `@prisma/client`, `@prisma/adapter-ppg` pinned
  to the same 7.x. Prisma 8 needs raw TCP and will not work — ignore Prisma's
  "update available" prompt.
- Generator `prisma-client`, `runtime = "workerd"`, output `src/generated/prisma`
  (git-ignored). The build script runs `prisma generate` first; the Build has
  no database.
- `getDb()` (`src/server/db.ts`) makes a NEW client per request and returns
  `null` when `DATABASE_URL` is empty — the Site Database is not enabled yet.
  Answer 503 then (`withDb` does); in the editor, ask the owner to enable the
  Site Database. Don't work around it.
- Schema in `prisma/schema.prisma`. Change it, then
  `npx prisma migrate dev --create-only --name <change>`, wrap the new
  `migration.sql` in `BEGIN;` … `COMMIT;` (unless it needs `CONCURRENTLY`),
  then `npx prisma migrate dev` to apply it to the Preview Database.
- Migrations live in `prisma/migrations/` (fixed path). Never edit or delete
  an applied migration. The platform applies pending ones to the live
  database at Publish, before the new version goes live; a failure keeps the
  old version serving. A version with migrations cannot deploy until the
  owner has enabled the Site Database.
- Forward-only: an older version may run on a newer schema, so change
  schemas expand-then-contract (add, backfill, switch, drop later). Drops,
  truncates and type changes wait for the owner's approval.
- Lists are bounded: `take` + a keyset cursor (see `GET /notes`), never an
  unbounded `findMany` or a `count()` on a growing table per request.
- Fake data in `prisma/seed.sql` (`npx prisma db seed`). `npm run studio` shows
  the Preview Database on port 5555. Live data never comes here.

## How changes go live

You edit a working copy; nothing visitors see changes until the OWNER
publishes. Publish → Prepare (detect) → Build (`npm ci`, `npm run build`) →
Migrate (pending `prisma/migrations`) → Deploy. Keep `npm run dev` working at
`/`: the editor Preview runs it.
