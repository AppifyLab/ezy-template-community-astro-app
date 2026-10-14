# Rules for AI agents working in this app

This repo is ONE community's public website AND its own small app, in one
Astro project on a Cloudflare Worker (`output: 'server'`, `@astrojs/cloudflare`).
It already works end to end: pages, sign-in awareness, a members' portal,
uploads, a contact inbox, a backend and a database. Extend it; don't rebuild
what is here.

## Map

| Path                       | What                                         | Code                                   |
| -------------------------- | -------------------------------------------- | -------------------------------------- |
| `/`                        | home: hero, features, latest posts           | `src/pages/index.astro`                |
| `/about`                   | static page                                  | `src/pages/about.astro`                |
| `/contact`                 | contact form → `POST /site-api/contact`      | `src/pages/contact.astro`              |
| `/blog`, `/blog/<slug>`    | the community's blog (public API)            | `src/pages/blog/`                      |
| `/portal/*`                | members' React app (TanStack Router + Query) | `src/portal/`, `src/pages/portal/`     |
| `/site-api/*`              | this site's backend: one Hono app            | `src/server/app.ts`                    |
| —                          | the Site Database: Prisma Postgres           | `prisma/`, `src/server/db.ts`          |
| —                          | words, nav, page copy                        | `src/content/site.ts`                  |

Every other path on the hostname (`/login`, `/register`, `/join`, `/feeds`,
`/profile/…`, `/dashboard`, `/api`, `/_next`, `/robots.txt`, `/sitemap.xml`…)
is served by the EzyCommunity App and never reaches this Worker. Link to those
with a plain `<a href>`, never a client-side `<Link>`.

## Current platform rules (read first)

This file is frozen at the template's tag; the platform's rules are not. Before
changing anything, read the live rules and follow them over this file:

- `https://<your site's hostname>/api/public/site/v1/agent-docs` — the core
  rules and the list of topic docs
- `https://<your site's hostname>/api/public/site/v1/agent-docs/<topic>.md` —
  `auth.md`, `uploads.md`, `public-api.md`, `community-key.md`, `site-api.md`,
  `site-database.md`, `publishing.md`; `changes.md` lists what is new.

Inside the EzyCommunity editor the same docs are at `/opt/ezy/docs/<topic>.md`.

## The three ways this site reads the platform

| As…            | How                                                        | Code                                     | Use for                                  |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| anyone         | `GET /api/public/...`, no credential                       | `src/lib/api.ts`                         | brand (name, logo, favicon), blog        |
| the VISITOR    | their `cookie` header forwarded to `/api/auth/me` etc.     | `src/server/viewer.ts`                   | who is signed in, their permissions      |
| the COMMUNITY  | `GET /api/site/v1/...` + `Bearer ${env.EZY_COMMUNITY_KEY}` | `src/server/community.ts`                | members, feed, courses, events, roles    |

All server-side fetches go to the community's OWN hostname (`EZY_SITE_URL`,
else the request's origin), send a `User-Agent` (Cloudflare 403s without one)
and `SELF_FETCH_HEADER` (see `src/middleware.ts`). Every response is
re-projected field by field into our own types, so nothing the platform adds
later (an email, say) leaks into a page.

The Community Key is the community, NOT the visitor: it never tells you who is
signed in. Show what you read with it only after the visitor's own session
allows it (`/site-api/members` does `requireMember` first).

## Pages (Astro)

- Start every page with
  `const {site, viewer} = await pageContext(Astro.request, Astro.response);`
  (`src/server/page.ts`) and pass both to `<Base>`. It fetches the brand and
  the visitor in parallel and marks the response `Cache-Control: private,
  no-store` — a page built from a visitor's cookies must never be shared.
- `viewer.state`: `member` (signed in, active), `applicant` (pending: link to
  `/join`, no member content), `returning` (access token expired, refresh
  cookie present: the layout's script refreshes ONCE in the browser and
  reloads), `guest`.
- Words live in `src/content/site.ts` (`{name}` = the community name). Add a
  page: a new `src/pages/<name>.astro` + an entry in `NAV`. Never under an
  App path (`src/pages/api/`, `login.astro`, `feeds/`…).
- Blog HTML is sanitized in `getPost` (`src/lib/sanitize.ts`) before any page
  sees it. Keep it that way; never `set:html` unsanitized platform HTML.
- An unknown post sets `Astro.response.status = 404` and renders `NotFound`.
- Server code reads env with `import {env} from 'cloudflare:workers'`
  (`Astro.locals.runtime` no longer exists). Relative fetch URLs fail on the
  server.

## Visitor auth (sign-in awareness, never sign-in itself)

- NEVER build a login, sign-up, join, password or account page, never ask for
  a password, never handle tokens. Link to the App: `/login?redirectTo=<path>`,
  `/register?redirectTo=<path>`, applicants `/join`. `redirectTo` is a
  URL-encoded PATH; the App ignores full URLs.
- Server: `getViewer(request)` forwards the cookie header unchanged to
  `/api/auth/me` and branches on the STATUS (200 member/applicant, 401
  returning-or-guest, everything else guest). Never call `/api/auth/refresh`
  from the server, never set/rename/delete auth cookies (`ecom_at`, `ecom_rt`;
  `__Host-` prefixed in production — HttpOnly), never set `x-forwarded-for`,
  `x-real-ip` or `ECOM_HOST`, never keep a viewer in a module variable.
- Browser: `src/lib/browser-session.ts` — `appFetch()` sends the
  `X-XSRF-TOKEN` header on writes (production answers 419 without it; it is
  off locally and in the Preview, so a missing header only fails LIVE) and
  shares ONE `/api/auth/refresh` on 401. `logout()` posts
  `/api/auth/logout` and reloads (there is no logout page).
- Permissions: `getViewerPermissions(request)` → the visitor's Role Manager
  codenames; `grants(perms, codename)` honours `*` wildcards. Use them to
  show/hide UI, and to guard THIS site's own data (`requirePermission`). The
  App's API enforces its own rules on its own data.
- `/api/auth/me` carries the viewer's OWN email. It is dropped in
  `getViewer`; never send any member's email to the browser, log it, or put it
  in a shared cache.

## Uploads (members)

Browser only: presign → `PUT` to the CDN → register (`uploadFile()` in
`src/lib/browser-session.ts`, used by `/portal/uploads`). The bytes never pass
through the server (it could not reach the CDN anyway). Then the URL
(`file_link`) is saved with `POST /site-api/uploads`. Images ≤ 10 MB,
documents/audio ≤ 500 MB, video ≤ 5 GB; the allowed extensions and errors are
in `uploads.md`. `402` = the community's storage is full/not in its plan: say
uploads are unavailable, never retry. Always `skip_gallery: true`.

## Portal (`/portal/*`)

- `src/pages/portal/[...path].astro` checks the visitor on the server: members
  get `<PortalApp client:only="react" />`, everyone else a sign-in prompt.
  That page is NOT the guard — every Site API route checks again.
- TanStack Router (`basepath: '/portal'`), routes in `src/portal/routes.tsx`:
  Overview (`/`), My files (`/uploads`), Members (`/members`), Inbox
  (`/inbox`, shown when `/site-api/me` says `canReadInbox`), Notes (`/notes`).
- Data from the Site API through TanStack Query and the typed `hc` client
  (`src/portal/api.ts`); App endpoints through `appFetch`. `<Link>` inside the
  portal; plain `<a href>` to Astro pages and App pages.
- `/portal` is this template's convention, not a reserved path. To move it,
  rename the page folder AND `basepath` together — never under an App path.

## Site API (`/site-api/*`)

- One Hono app, `new Hono().basePath('/site-api')`, mounted ONLY by
  `src/pages/site-api/[...path].ts` (`ALL`, `prerender = false`). Add routes in
  `src/server/app.ts`, CHAINED, so `AppType` stays complete for `hc`.
- Middleware, in this order when combined: input `validator` → `withViewer`
  (sets `c.var.viewer`, marks the answer private) → `requireMember` →
  `requirePermission(codename)` → `withDb` (503 when no Site Database).
- Routes today: `GET /health`, `GET /me`, `POST /contact` (public, honeypot),
  `GET /contact` (`community:site:read`), `GET|POST /uploads` (members),
  `GET /community` and `GET /members` (Community Key; members only),
  `GET|POST /notes`, `GET /notes/:id`.
- Errors are JSON `{error, message}`; the `notFound` and `onError` handlers
  stay. `csrf()` stays on unless a route is deliberately cross-site (a webhook).
  Validate every input and select columns explicitly.
- Pages call it in-process: `hc<AppType>(url, {fetch: app.request})` or
  `app.request(path)`. Never `fetch()` this site's own hostname for
  `/site-api/…` or a page: deployed, that reaches the App (a 404). Server
  fetches of `/api/…` are fine.
- A server route that forwards a member WRITE to the App must sit behind
  `csrf()` and pass on the browser's own `X-XSRF-TOKEN` header. Prefer doing
  member writes from the browser (`appFetch`).

## Secrets and the network

- The platform sets `EZY_SITE_URL` (a plain var), `DATABASE_URL` (the Site
  Database; in the editor, its Preview Database) and `EZY_COMMUNITY_KEY` (in
  the editor, a separate editor key) as Worker secrets. Read them from `env`
  in server code only. Never send them to the browser, log them, write them
  to a file (`.env`, `.dev.vars`, config) or commit them. A `.dev.vars` file
  stops the editor Preview from receiving them.
- You cannot add secrets: never hardcode a key, token or password, never ask
  the owner for one.
- Deployed server code reaches ONLY the community's own hostname and the Site
  Database (`db.prisma.io`); every other host fails `403 Egress blocked`. Raw
  TCP (`pg`, `postgres`, `node:net`) does not work at all.

## Site Database (Prisma Postgres)

- Tables: `notes` (example), `contact_messages` (the contact inbox; the
  sender's typed email is shown ONLY in the admin inbox), `uploads` (member
  files, by `profile_id`).
- Prisma ORM 7 ONLY: `prisma`, `@prisma/client`, `@prisma/adapter-ppg` pinned
  to the same 7.x. Prisma 8 needs raw TCP and will not work — ignore Prisma's
  "update available" prompt.
- Generator `prisma-client`, `runtime = "workerd"`, output `src/generated/prisma`
  (git-ignored). The build script runs `prisma generate` first; the Build has
  no database.
- `getDb()` makes a NEW client per request and returns `null` when
  `DATABASE_URL` is empty (Site Database not enabled): answer 503 (`withDb`
  does); in the editor, ask the owner to enable the Site Database.
- Change the schema, then `npx prisma migrate dev --create-only --name <change>`,
  wrap the new `migration.sql` in `BEGIN;` … `COMMIT;` (unless it needs
  `CONCURRENTLY`), then `npx prisma migrate dev` to apply it to the Preview
  Database. Never edit or delete an applied migration.
- The platform applies pending migrations to the live database at Publish,
  before the new version goes live; a failure keeps the old version serving. A
  version with migrations cannot deploy until the owner has enabled the Site
  Database.
- Forward-only: expand-then-contract (add, backfill, switch, drop later).
  Drops, truncates and type changes wait for the owner's approval.
- Lists are bounded: `take` + a keyset cursor (`?before=<id>`), never an
  unbounded `findMany` or a `count()` on a growing table per request.
- Fake data in `prisma/seed.sql` (`npx prisma db seed`, example.com addresses
  only). `npm run studio` shows the Preview Database on port 5555.

## Project

- Keep the adapter `@astrojs/cloudflare` (14.x). `@astrojs/node|vercel|netlify`
  are refused by the platform.
- npm only: keep `package-lock.json` committed (the Build runs `npm ci`), no
  second lockfile. `allowScripts` in `package.json` approves the install
  scripts the project needs; after a version bump approve the new versions.
- Commit NO wrangler config (`wrangler.json[c]`/`.toml`): the platform writes
  it. NO `Astro.session`, NO on-demand image transforms (`imageService` stays
  `'passthrough'`): there are no KV, R2, D1, Images or service bindings.
- No `robots.txt` / `sitemap.xml`, no `base`, no asset prefix, no
  `.github/workflows/`.

## How changes go live

You edit a working copy; nothing visitors see changes until the OWNER
publishes. Publish → Prepare (detect) → Build (`npm ci`, `npm run build`) →
Migrate (pending `prisma/migrations`) → Deploy. Keep `npm run dev` working at
`/`: the editor Preview runs it. The Preview has no visitor session: pages
render as a guest there, and the editor Community Key is the only way to see
member-level data while building.
